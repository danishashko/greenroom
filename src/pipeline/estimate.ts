import type { LlmProvider } from "../llm/types.js";

export interface EstimateInput {
  personas: number;
  rounds: number;
  samples?: number;
  maxQueries: number;
  maxPages: number;
  urls: number;
  searchEnabled: boolean;
  llm: Pick<LlmProvider, "id" | "kind" | "concurrency" | "models">;
}

export interface Estimate {
  calls: { total: number; breakdown: Record<string, number> };
  tokens: { input: number; output: number };
  /** Seconds, assuming about 12 s per call at the provider's concurrency. */
  seconds: number;
  cost: { kind: "subscription" | "api" | "local"; note: string; usd: number | null };
  suggestedMaxCalls: number;
}

/**
 * Pre-flight numbers. Token counts use typical prompt sizes, so read them as the
 * right order of magnitude. Dollar figures need prices supplied by the user.
 */
export function estimateRun(i: EstimateInput): Estimate {
  const pages = (i.searchEnabled ? i.maxPages : 0) + i.urls;
  const queries = i.searchEnabled && i.maxQueries > 0 ? 1 : 0;
  const samples = i.samples ?? 1;
  const simulate = samples * i.personas * i.rounds;
  const breakdown: Record<string, number> = {
    "ground:queries": queries,
    "ground:extract": pages,
    personas: samples,
    simulate,
    "report:themes": 1,
    "report:verdict": 1,
  };
  const base = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const total = Math.ceil(base * 1.1); // headroom for repair retries
  const input = queries * 700 + pages * 4_000 + 9_000 * samples + simulate * 1_800 + 4_000 + 6_000;
  const output = pages * 500 + 3_000 * samples + simulate * 450 + 900 + 900;
  const seconds = Math.round((total * 12) / Math.max(1, i.llm.concurrency));

  const inPrice = Number(process.env["GREENROOM_PRICE_IN_PER_M"]);
  const outPrice = Number(process.env["GREENROOM_PRICE_OUT_PER_M"]);
  let cost: Estimate["cost"];
  if (i.llm.kind === "subscription") {
    cost = { kind: "subscription", note: `No per-call charge. Uses your plan quota: about ${total} short requests.`, usd: null };
  } else if (i.llm.kind === "local") {
    cost = { kind: "local", note: "Runs on your machine. No charge.", usd: null };
  } else if (inPrice > 0 && outPrice > 0) {
    cost = {
      kind: "api",
      note: "From GREENROOM_PRICE_IN_PER_M and GREENROOM_PRICE_OUT_PER_M.",
      usd: Math.round(((input * inPrice + output * outPrice) / 1_000_000) * 100) / 100,
    };
  } else {
    cost = { kind: "api", note: "Set GREENROOM_PRICE_IN_PER_M and GREENROOM_PRICE_OUT_PER_M (USD per million tokens) for a dollar figure.", usd: null };
  }
  return { calls: { total, breakdown }, tokens: { input, output }, seconds, cost, suggestedMaxCalls: Math.max(40, Math.ceil(total * 1.3)) };
}
