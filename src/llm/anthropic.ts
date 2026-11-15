import { GreenroomError } from "../errors.js";
import { BaseProvider, type BaseOptions } from "./base.js";
import type { ProviderCheck, RawRequest, RawResult } from "./types.js";

/** Keywords structured outputs rejects. Zod still validates them on the answer, with repair retries. */
const UNSUPPORTED = new Set(["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "uniqueItems", "pattern"]);

/**
 * Fit a JSON Schema to the structured outputs subset: drop length and range limits, and close every
 * object with additionalProperties false, which the API requires.
 */
export function toStructuredSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStructuredSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED.has(k)) continue;
    out[k] = k === "properties" && v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([p, s]) => [p, toStructuredSchema(s)])) : toStructuredSchema(v);
  }
  if (out["type"] === "object" || "properties" in out) out["additionalProperties"] = false;
  return out;
}

/** Anthropic Messages API with structured outputs (output_config.format), so answers match the schema. */
export class AnthropicApiProvider extends BaseProvider {
  id = "anthropic";
  label = "Anthropic API (API key)";
  kind = "api" as const;
  concurrency = 6;
  models: { fast: string; strong: string };
  private apiKey: string;

  constructor(apiKey: string, opts: BaseOptions = {}) {
    super(opts);
    this.apiKey = apiKey;
    this.models = {
      fast: opts.models?.fast ?? process.env["GREENROOM_MODEL_FAST"] ?? "claude-sonnet-5-5",
      strong: opts.models?.strong ?? process.env["GREENROOM_MODEL_STRONG"] ?? "claude-opus-5-5",
    };
  }

  async check(): Promise<ProviderCheck> {
    try {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401) return { ok: false, detail: "Anthropic rejected the API key.", hint: "Check ANTHROPIC_API_KEY." };
      return { ok: res.ok, detail: res.ok ? "API key accepted." : `HTTP ${res.status}.` };
    } catch (e) {
      return { ok: false, detail: `Cannot reach api.anthropic.com: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  protected async raw(req: RawRequest): Promise<RawResult> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: req.model,
        // Current models think before answering; leave room so the JSON is not cut off.
        max_tokens: 16000,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
        output_config: { format: { type: "json_schema", schema: toStructuredSchema(req.schemaJson) } },
      }),
      signal: AbortSignal.timeout(Number(process.env["GREENROOM_HTTP_TIMEOUT_MS"] ?? 240_000)),
    });
    if (!res.ok) {
      throw new GreenroomError(
        res.status === 401 ? "PROVIDER_UNAVAILABLE" : "INTERNAL",
        `anthropic returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
        res.status === 401 ? "Check ANTHROPIC_API_KEY." : undefined,
      );
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (data.stop_reason === "refusal") throw new GreenroomError("LLM_INVALID_OUTPUT", "anthropic declined this request (stop_reason refusal).", "Rephrase the change, or use another backend.");
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    return {
      text,
      usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
    };
  }
}
