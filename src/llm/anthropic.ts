import { GreenroomError } from "../errors.js";
import { BaseProvider, type BaseOptions } from "./base.js";
import type { ProviderCheck, RawRequest, RawResult } from "./types.js";

/** Anthropic Messages API with forced tool use for schema-exact output. */
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
        max_tokens: 8000,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
        tools: [{ name: "respond", description: "Return the structured answer.", input_schema: req.schemaJson }],
        tool_choice: { type: "tool", name: "respond" },
      }),
      signal: AbortSignal.timeout(Number(process.env["GREENROOM_HTTP_TIMEOUT_MS"] ?? 180_000)),
    });
    if (!res.ok) {
      throw new GreenroomError(
        res.status === 401 ? "PROVIDER_UNAVAILABLE" : "INTERNAL",
        `anthropic returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
        res.status === 401 ? "Check ANTHROPIC_API_KEY." : undefined,
      );
    }
    const data = (await res.json()) as {
      content?: { type: string; input?: unknown }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const tool = data.content?.find((c) => c.type === "tool_use");
    return {
      json: tool?.input,
      usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
    };
  }
}
