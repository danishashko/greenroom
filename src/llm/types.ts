import type { z } from "zod";
import type { Meter, Usage } from "../meter.js";

export type ModelTier = "fast" | "strong";
export type ProviderKind = "subscription" | "api" | "local";

export interface CompleteRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Used for the call cap and for logs. */
  label: string;
  tier: ModelTier;
}

export interface RawResult {
  /** Already-parsed JSON when the provider enforces a schema natively. */
  json?: unknown;
  /** Free text that should contain JSON. */
  text?: string;
  usage: Usage;
}

export interface RawRequest {
  system: string;
  prompt: string;
  schemaJson: Record<string, unknown>;
  model: string;
}

export interface ProviderCheck {
  ok: boolean;
  detail: string;
  hint?: string;
}

export interface LlmProvider {
  id: string;
  label: string;
  kind: ProviderKind;
  /** Parallel calls that are safe for this backend. */
  concurrency: number;
  experimental?: boolean;
  models: { fast: string; strong: string };
  check(deep?: boolean): Promise<ProviderCheck>;
  /** Route call and token counts to a run's meter. */
  attachMeter?(meter: Meter): unknown;
  /** One call, schema-validated, with repair retries. */
  complete<T>(req: CompleteRequest<T>): Promise<{ data: T; usage: Usage }>;
}
