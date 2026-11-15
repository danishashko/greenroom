import { z } from "zod";
import { GreenroomError } from "../errors.js";
import { personasPrompt, SYSTEM_ANALYST } from "../prompts.js";
import { PriceSensitivity, type Evidence, type Persona, type Segment } from "../schema.js";
import { round } from "../util.js";
import { diversify } from "./ground.js";
import type { Ctx } from "./context.js";

const RawPersona = z.object({
  name: z.string(),
  role: z.string(),
  segment: z.string(),
  summary: z.string(),
  goals: z.array(z.string()).min(1).max(6),
  objections: z.array(z.string()).min(1).max(6),
  priceSensitivity: PriceSensitivity,
  currentSolution: z.string(),
  evidenceIds: z.array(z.string()).default([]),
});
const PersonasSchema = z.object({ personas: z.array(RawPersona).min(1).max(16) });

/** With seed segments, every persona must name one, so its share can come from real customer counts. */
function personasSchemaFor(segments: Segment[] | undefined) {
  if (!segments?.length) return PersonasSchema;
  const names = segments.map((s) => s.name) as [string, ...string[]];
  return z.object({ personas: z.array(RawPersona.extend({ customerSegment: z.enum(names) })).min(1).max(16) });
}

export const MIN_PERSONAS = 3;
const PROMPT_EVIDENCE_CAP = 90;

/**
 * Weight each persona by how much real evidence supports it, so audience share
 * comes from the data and not from the model's guess. Ungrounded runs split evenly.
 */
export function weightPersonas<T extends { evidenceIds: string[] }>(personas: T[]): (T & { weight: number })[] {
  // A quote cited by several personas is split between them, so shared voices do not count twice.
  const cited = new Map<string, number>();
  for (const p of personas) for (const id of p.evidenceIds) cited.set(id, (cited.get(id) ?? 0) + 1);
  const raw = personas.map((p) => 0.5 + p.evidenceIds.reduce((s, id) => s + 1 / (cited.get(id) ?? 1), 0));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return personas.map((p, i) => ({ ...p, weight: round((raw[i] ?? 1) / total, 4) }));
}

/**
 * Anchor shares to the real customer base: each segment's share of customers is split among its
 * personas by their evidence weight. Segments no persona covers are reported, and the rest renormalized.
 */
export function anchorWeights<T extends { weight: number; customerSegment?: string }>(
  personas: T[],
  segments: Segment[],
): { personas: T[]; uncovered: string[] } {
  const total = segments.reduce((s, x) => s + x.customers, 0) || 1;
  const covered = segments.filter((seg) => personas.some((p) => p.customerSegment === seg.name));
  const coveredShare = covered.reduce((s, x) => s + x.customers, 0) / total || 1;
  const out = personas.map((p) => {
    const seg = covered.find((x) => x.name === p.customerSegment);
    if (!seg) return { ...p, weight: 0 };
    const peers = personas.filter((q) => q.customerSegment === seg.name);
    const inSeg = peers.reduce((s, q) => s + q.weight, 0);
    const within = inSeg > 0 ? p.weight / inSeg : 1 / peers.length;
    return { ...p, weight: round(((seg.customers / total) * within) / coveredShare, 4) };
  });
  return { personas: out, uncovered: segments.filter((x) => !covered.includes(x)).map((x) => x.name) };
}

/** Customer quotes go first; the web fills the remaining prompt slots, spread across domains. */
export function promptEvidence(evidence: Evidence[], cap = PROMPT_EVIDENCE_CAP): Evidence[] {
  const own = evidence.filter((e) => e.source === "customer").slice(0, cap);
  return [...own, ...diversify(evidence.filter((e) => e.source !== "customer"), cap - own.length)];
}

export async function personasStage(ctx: Ctx, evidence: Evidence[], productContext: string | undefined): Promise<Persona[]> {
  const grounded = evidence.length > 0;
  if (!grounded && !ctx.allowUngrounded) {
    throw new GreenroomError(
      "INSUFFICIENT_EVIDENCE",
      "No source evidence was collected, so personas would be invented.",
      "Set BRIGHTDATA_API_KEY for search, pass --urls or --evidence, or add --allow-ungrounded to proceed with model-written personas.",
    );
  }
  const shown = promptEvidence(evidence);
  const segments = ctx.seed.segments;
  ctx.emit({ stage: "personas", level: "info", message: `Building ${ctx.personaCount} personas from ${shown.length} quotes` });
  const res = await ctx.llm.complete({
    system: SYSTEM_ANALYST,
    prompt: personasPrompt(ctx.seed, shown, ctx.personaCount, productContext, !grounded),
    schema: personasSchemaFor(segments),
    label: "personas",
    tier: "strong",
  });

  const valid = new Set(evidence.map((e) => e.id));
  const kept = res.data.personas
    .map((p) => ({ ...p, evidenceIds: [...new Set(p.evidenceIds.filter((id) => valid.has(id)))] }))
    .filter((p) => !grounded || p.evidenceIds.length > 0);

  if (kept.length < MIN_PERSONAS) {
    throw new GreenroomError(
      "INSUFFICIENT_EVIDENCE",
      `Only ${kept.length} personas were backed by real quotes (need ${MIN_PERSONAS}).`,
      "Collect more evidence: more queries, more pages, or --evidence files.",
    );
  }
  const weighted = weightPersonas(kept.slice(0, ctx.personaCount) as (z.infer<typeof RawPersona> & { customerSegment?: string })[]);
  if (!segments?.length) return weighted.map((p, i) => ({ ...p, id: `p${i + 1}` }));
  const anchored = anchorWeights(weighted, segments);
  if (anchored.uncovered.length) {
    ctx.emit({ stage: "personas", level: "warn", message: `No persona covers segment ${anchored.uncovered.join(", ")}. Its customers are left out of the shares.` });
  }
  return anchored.personas.map((p, i) => ({ ...p, id: `p${i + 1}` }));
}
