import { GreenroomError } from "../errors.js";
import { BaseProvider, withSchemaInPrompt, type BaseOptions } from "./base.js";
import type { ProviderCheck, ProviderKind, RawRequest, RawResult } from "./types.js";

export interface OpenAiCompatConfig extends BaseOptions {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey?: string;
  defaultModels: { fast: string; strong: string };
  concurrency?: number;
  extraHeaders?: Record<string, string>;
}

/** Any OpenAI-format chat endpoint: OpenAI, OpenRouter, Ollama, LM Studio, vLLM, Together, Groq and more. */
export class OpenAiCompatProvider extends BaseProvider {
  id: string;
  label: string;
  kind: ProviderKind;
  concurrency: number;
  models: { fast: string; strong: string };
  private baseUrl: string;
  private apiKey?: string;
  private headers: Record<string, string>;

  constructor(cfg: OpenAiCompatConfig) {
    super(cfg);
    this.id = cfg.id;
    this.label = cfg.label;
    this.kind = cfg.kind;
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.apiKey = cfg.apiKey;
    this.concurrency = cfg.concurrency ?? (cfg.kind === "local" ? 2 : 8);
    this.models = {
      fast: cfg.models?.fast ?? cfg.defaultModels.fast,
      strong: cfg.models?.strong ?? cfg.defaultModels.strong,
    };
    this.headers = cfg.extraHeaders ?? {};
  }

  async check(): Promise<ProviderCheck> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, { headers: this.authHeaders(), signal: AbortSignal.timeout(8000) });
      if (res.status === 401 || res.status === 403) return { ok: false, detail: `Rejected the API key (${res.status}).`, hint: "Check the key for this provider." };
      return { ok: res.ok, detail: res.ok ? `Reachable at ${this.baseUrl}.` : `HTTP ${res.status} from ${this.baseUrl}.` };
    } catch (e) {
      return { ok: false, detail: `Cannot reach ${this.baseUrl}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  private authHeaders(): Record<string, string> {
    return { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}), ...this.headers };
  }

  protected async raw(req: RawRequest): Promise<RawResult> {
    const messages = [
      { role: "system", content: req.system },
      { role: "user", content: withSchemaInPrompt(req.prompt, req.schemaJson) },
    ];
    const attempt = async (responseFormat: unknown) => {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.authHeaders(),
        // Without max_tokens some hosts reserve the model's full output window and refuse low balances.
        body: JSON.stringify({ model: req.model, messages, temperature: 0.7, max_tokens: 16000, response_format: responseFormat }),
        signal: AbortSignal.timeout(Number(process.env["GREENROOM_HTTP_TIMEOUT_MS"] ?? 180_000)),
      });
      return res;
    };

    let res = await attempt({ type: "json_schema", json_schema: { name: "response", schema: req.schemaJson } });
    if (res.status === 400 || res.status === 422) res = await attempt({ type: "json_object" });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new GreenroomError(
        res.status === 401 || res.status === 402 || res.status === 403 ? "PROVIDER_UNAVAILABLE" : "INTERNAL",
        `${this.id} returned HTTP ${res.status}: ${body}`,
        res.status === 401 ? "Check the API key." : res.status === 402 ? "The account is out of credits. Add credits or use another backend." : undefined,
      );
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
    };
  }
}
