import { z } from "zod";
import { digestFrom, reactionPrompt, SYSTEM_ROLEPLAY } from "../prompts.js";
import { Action, type Evidence, type Persona, type Reaction } from "../schema.js";
import { pMap } from "../util.js";
import type { Ctx } from "./context.js";

const ReactionBody = z.object({
  stance: z.number().int().min(-2).max(2),
  action: Action,
  switchTo: z.string().optional(),
  objections: z.array(z.string()).max(6),
  reasoning: z.string().min(10),
  wouldChangeMindIf: z.string().optional(),
  evidenceIds: z.array(z.string()).default([]),
});

/** Product facts matter for round 1; later rounds mostly need the debate, so trim repeated context. */
const PRODUCT_CONTEXT_PER_CALL = 2_000;

export interface SimulateOptions {
  /** Reactions from rounds already finished, for resume. */
  prior?: Reaction[];
  /** Appended to progress messages, for example " (sample 2 of 3)". */
  label?: string;
  /** Called after each full round with every reaction so far. */
  onRound?: (all: Reaction[]) => void;
}

/**
 * Round 1: each persona reacts alone. Later rounds: each sees a digest of what the
 * others said in the previous round, so opinions can move. Returns every reaction.
 */
export async function simulateStage(
  ctx: Ctx,
  personas: Persona[],
  evidence: Evidence[],
  productContext: string | undefined,
  opts: SimulateOptions = {},
): Promise<Reaction[]> {
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const context = productContext?.slice(0, PRODUCT_CONTEXT_PER_CALL);
  const all: Reaction[] = [...(opts.prior ?? [])];
  const done = all.reduce((m, r) => Math.max(m, r.round), 0);
  let previous = all.filter((r) => r.round === done);

  for (let round = done + 1; round <= ctx.rounds; round++) {
    ctx.emit({ stage: "simulate", level: "info", message: `Round ${round} of ${ctx.rounds}${opts.label ?? ""}`, data: { round } });
    const current = await pMap(personas, ctx.llm.concurrency, async (persona, idx): Promise<Reaction> => {
      const own = persona.evidenceIds.map((id) => evById.get(id)).filter((e): e is Evidence => !!e).slice(0, 8);
      const others = previous.filter((r) => r.personaId !== persona.id);
      const digest = round > 1 ? digestFrom(others, personas, idx) : undefined;
      const out = await ctx.llm.complete({
        system: SYSTEM_ROLEPLAY,
        prompt: reactionPrompt({ seed: ctx.seed, productContext: context, persona, ownEvidence: own, round, rounds: ctx.rounds, digest }),
        schema: ReactionBody,
        label: `simulate:r${round}`,
        tier: "fast",
      });
      return { ...out.data, personaId: persona.id, round, evidenceIds: out.data.evidenceIds.filter((id) => evById.has(id)) };
    });
    all.push(...current);
    previous = current;
    opts.onRound?.(all);
  }
  return all;
}
