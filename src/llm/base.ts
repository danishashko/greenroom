import { jsonSchemaOf } from "../schema.js";
import { GreenroomError } from "../errors.js";
import { sleep } from "../util.js";
import type { Meter, Usage } from "../meter.js";
import type { CompleteRequest, LlmProvider, ProviderCheck, ProviderKind, RawRequest, RawResult } from "./types.js";

/** Pull the first balanced JSON object out of free text. Handles code fences and prose. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in output.");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error("Unterminated JSON object in output.");
}

export interface BaseOptions {
  meter?: Meter;
  models?: { fast?: string; strong?: string };
  maxRepairs?: number;
}

/**
 * Shared completion loop: reserve budget, call the backend, validate with zod,
 * and feed validation errors back for up to maxRepairs retries.
 */
export abstract class BaseProvider implements LlmProvider {
  abstract id: string;
  abstract label: string;
  abstract kind: ProviderKind;
  abstract concurrency: number;
  experimental = false;
  abstract models: { fast: string; strong: string };
  meter?: Meter;
  protected maxRepairs: number;

  constructor(opts: BaseOptions = {}) {
    this.meter = opts.meter;
    this.maxRepairs = opts.maxRepairs ?? 2;
  }

  attachMeter(meter: Meter): this {
    this.meter = meter;
    return this;
  }

  abstract check(deep?: boolean): Promise<ProviderCheck>;
  protected abstract raw(req: RawRequest): Promise<RawResult>;

  /** Backoff in ms between transient retries. Overridable for tests. */
  protected retryDelays = [3_000, 10_000];

  /**
   * One flaky call (rate limit, overload, timeout, dropped socket) should not kill a
   * 40-call run. Auth and missing-binary errors are not retried.
   */
  private async rawWithRetry(req: RawRequest): Promise<RawResult> {
    for (let i = 0; ; i++) {
      try {
        return await this.raw(req);
      } catch (e) {
        const delay = this.retryDelays[i];
        if (delay === undefined || !isTransient(e)) throw e;
        await sleep(delay);
      }
    }
  }

  async complete<T>(req: CompleteRequest<T>): Promise<{ data: T; usage: Usage }> {
    const schemaJson = jsonSchemaOf(req.schema);
    const model = this.models[req.tier];
    const total: Usage = { inputTokens: 0, outputTokens: 0 };
    let prompt = req.prompt;
    let lastError = "";

    for (let attempt = 0; attempt <= this.maxRepairs; attempt++) {
      this.meter?.reserve(attempt === 0 ? req.label : `${req.label}:repair`);
      const res = await this.rawWithRetry({ system: req.system, prompt, schemaJson, model });
      total.inputTokens += res.usage.inputTokens;
      total.outputTokens += res.usage.outputTokens;
      if (res.usage.listPriceUsd !== undefined) total.listPriceUsd = (total.listPriceUsd ?? 0) + res.usage.listPriceUsd;
      this.meter?.add(res.usage);

      try {
        const candidate = res.json ?? extractJson(res.text ?? "");
        const parsed = req.schema.safeParse(candidate);
        if (parsed.success) return { data: parsed.data, usage: total };
        lastError = parsed.error.issues
          .slice(0, 6)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      prompt = `${req.prompt}\n\nYour previous answer was rejected: ${lastError}\nReturn only a corrected JSON object that matches the schema.`;
    }
    throw new GreenroomError(
      "LLM_INVALID_OUTPUT",
      `"${req.label}" failed schema validation after ${this.maxRepairs + 1} attempts: ${lastError}`,
      "Try a stronger model with --model-strong, or lower --personas.",
    );
  }
}

const TRANSIENT = /crashed|timed out|timeout|overload|rate.?limit|too many requests|HTTP 429|HTTP 5\d\d|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|temporar|try again/i;
const PERMANENT = /not found on PATH|rejected the API key|not set|invalid api key|authentication|unauthori[sz]ed|HTTP 40[13]/i;

export function isTransient(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return TRANSIENT.test(msg) && !PERMANENT.test(msg);
}

/** Appends the JSON schema to the prompt for backends without native schema enforcement. */
export function withSchemaInPrompt(prompt: string, schemaJson: Record<string, unknown>): string {
  return `${prompt}\n\nReturn ONLY one JSON object, no prose, matching this JSON Schema:\n${JSON.stringify(schemaJson)}`;
}
