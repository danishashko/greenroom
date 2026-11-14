import { z } from "zod";
import { SYSTEM_ANALYST, themesPrompt, verdictPrompt } from "../prompts.js";
import {
  REPORT_SCHEMA_VERSION,
  RecommendationSchema,
  type Confidence,
  type Ensemble,
  type Evidence,
  type Persona,
  type Reaction,
  type Report,
} from "../schema.js";
import { pct, round } from "../util.js";
import type { Ctx } from "./context.js";

type Stats = Report["stats"];
type Theme = Report["themes"][number];

const ThemesSchema = z.object({
  themes: z
    .array(z.object({ label: z.string().min(3), objectionNumbers: z.array(z.number().int().min(0)).min(1) }))
    .max(8),
});

const VerdictSchema = z.object({
  readout: z.string().min(20),
  recommendations: z.array(RecommendationSchema).min(1).max(4),
  riskiest: z.object({ personaId: z.string(), why: z.string() }),
});

/** All headline numbers come from code, weighted by persona share. The model never writes a statistic. */
export function computeStats(personas: Persona[], reactions: Reaction[], rounds: number): Stats {
  const w = new Map(personas.map((p) => [p.id, p.weight]));
  const last = reactions.filter((r) => r.round === rounds);
  const first = new Map(reactions.filter((r) => r.round === 1).map((r) => [r.personaId, r]));
  let neg = 0;
  let neu = 0;
  let pos = 0;
  let mean = 0;
  let leave = 0;
  let moved = 0;
  const actions: Record<string, number> = {};
  for (const r of last) {
    const wt = w.get(r.personaId) ?? 0;
    if (r.stance < 0) neg += wt;
    else if (r.stance > 0) pos += wt;
    else neu += wt;
    mean += wt * r.stance;
    if (r.action === "churn" || r.action === "switch_competitor") leave += wt;
    actions[r.action] = round((actions[r.action] ?? 0) + wt, 4);
    const f = first.get(r.personaId);
    if (f && f.stance !== r.stance) moved += wt;
  }
  const total = neg + neu + pos || 1;
  return {
    personas: personas.length,
    rounds,
    negativeShare: round(neg / total),
    neutralShare: round(neu / total),
    positiveShare: round(pos / total),
    meanStance: round(mean / total, 2),
    leaveShare: round(leave / total),
    actions,
    movedMindShare: round(moved / total),
  };
}

function range(values: number[]): Ensemble["leaveShare"] {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? (v[mid] as number) : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
  return { median: round(median), min: round(v[0] ?? 0), max: round(v[v.length - 1] ?? 0) };
}

/** Median and range across samples, plus which sample to show: the one closest to the median leave share. */
export function buildEnsemble(perSample: Stats[]): Ensemble {
  const rows = perSample.map((s) => ({ negativeShare: s.negativeShare, positiveShare: s.positiveShare, leaveShare: s.leaveShare, meanStance: s.meanStance }));
  const leave = range(rows.map((r) => r.leaveShare));
  let shown = 0;
  rows.forEach((r, i) => {
    if (Math.abs(r.leaveShare - leave.median) < Math.abs((rows[shown] as typeof r).leaveShare - leave.median)) shown = i;
  });
  return {
    samples: rows.length,
    shownSample: shown,
    negativeShare: range(rows.map((r) => r.negativeShare)),
    positiveShare: range(rows.map((r) => r.positiveShare)),
    leaveShare: leave,
    meanStance: range(rows.map((r) => r.meanStance)),
    perSample: rows,
  };
}

function withRange(r: Ensemble["leaveShare"], samples: number): string {
  if (samples < 2 || Math.round(r.min * 100) === Math.round(r.max * 100)) return pct(r.median);
  return `${pct(r.median)} (${Math.round(r.min * 100)} to ${pct(r.max)})`;
}

/** Numbers first. With several samples, the medians lead and the range follows in brackets. */
export function buildHeadline(e: Ensemble, topTheme?: string): string {
  const leave = withRange(e.leaveShare, e.samples);
  const lead =
    e.negativeShare.median >= e.positiveShare.median
      ? `${withRange(e.negativeShare, e.samples)} of the audience reacts negatively and ${leave} would leave or switch.`
      : `${withRange(e.positiveShare, e.samples)} of the audience reacts positively and ${leave} would leave or switch.`;
  return topTheme ? `${lead} Main objection: ${topTheme.toLowerCase()}.` : lead;
}

/** Wide disagreement between samples is a confidence problem even when evidence is plentiful. */
export const SPREAD_LIMIT = 0.25;

export function gradeConfidence(evidenceCount: number, domainCount: number, grounded: boolean, ensemble?: Ensemble): { level: Confidence; reason: string } {
  let level: Confidence;
  let reason: string;
  if (!grounded) {
    level = "low";
    reason = "No source evidence. Personas were written by the model from the description.";
  } else if (evidenceCount < 12 || domainCount < 3) {
    level = "low";
    reason = `${evidenceCount} quotes from ${domainCount} domains is thin.`;
  } else if (evidenceCount < 30 || domainCount < 5) {
    level = "medium";
    reason = `${evidenceCount} quotes from ${domainCount} domains.`;
  } else {
    level = "high";
    reason = `${evidenceCount} quotes from ${domainCount} domains.`;
  }
  if (ensemble && ensemble.samples > 1) {
    const spread = Math.max(ensemble.leaveShare.max - ensemble.leaveShare.min, ensemble.negativeShare.max - ensemble.negativeShare.min);
    if (spread > SPREAD_LIMIT) {
      level = level === "high" ? "medium" : "low";
      reason += ` Samples disagree: would leave ranged ${Math.round(ensemble.leaveShare.min * 100)} to ${pct(ensemble.leaveShare.max)}.`;
    } else {
      reason += ` ${ensemble.samples} samples agree within ${Math.round(spread * 100)} points.`;
    }
  } else if (ensemble) {
    reason += " Single sample, so run-to-run spread is unknown.";
  }
  return { level, reason };
}

export function buildThemes(
  grouped: { label: string; objectionNumbers: number[] }[],
  items: { personaId: string; text: string }[],
  personas: Persona[],
  reactions: Reaction[],
  evidence: Evidence[],
): Theme[] {
  const w = new Map(personas.map((p) => [p.id, p.weight]));
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const personaById = new Map(personas.map((p) => [p.id, p]));
  const themes: Theme[] = [];
  const used = new Set<number>();
  for (const g of grouped) {
    const ids = new Set<string>();
    for (const n of g.objectionNumbers) {
      const it = items[n];
      if (it && !used.has(n)) {
        ids.add(it.personaId);
        used.add(n);
      }
    }
    if (!ids.size) continue;
    const personaIds = [...ids];
    const weight = round(personaIds.reduce((s, id) => s + (w.get(id) ?? 0), 0), 4);
    const quotes: Theme["quotes"] = [];
    for (const id of personaIds) {
      const cited = reactions.filter((r) => r.personaId === id).flatMap((r) => r.evidenceIds);
      for (const eid of [...cited, ...(personaById.get(id)?.evidenceIds ?? [])]) {
        const e = evById.get(eid);
        if (e && !quotes.some((q) => q.evidenceId === eid) && quotes.length < 3) {
          quotes.push({ evidenceId: eid, quote: e.quote, url: e.url });
          break;
        }
      }
    }
    themes.push({ label: g.label, weight, personaIds, quotes });
  }
  return themes.sort((a, b) => b.weight - a.weight);
}

export interface ReportInput {
  runId: string;
  createdAt: string;
  startedAtMs: number;
  evidence: Evidence[];
  /** One entry per sample. The report shows the sample closest to the median. */
  samples: { personas: Persona[]; reactions: Reaction[] }[];
  groundingProvider: string;
  droppedAfterCutoff?: number;
}

export async function reportStage(ctx: Ctx, input: ReportInput): Promise<Report> {
  const { evidence } = input;
  const perSample = input.samples.map((s) => computeStats(s.personas, s.reactions, ctx.rounds));
  const ensemble = buildEnsemble(perSample);
  const shown = input.samples[ensemble.shownSample] as ReportInput["samples"][number];
  const { personas, reactions } = shown;
  const stats = perSample[ensemble.shownSample] as Stats;

  const lastRound = reactions.filter((r) => r.round === ctx.rounds);
  const items = lastRound.flatMap((r) => r.objections.map((text) => ({ personaId: r.personaId, text })));

  ctx.emit({ stage: "report", level: "info", message: "Grouping objections" });
  let themes: Theme[] = [];
  if (items.length) {
    const grouped = await ctx.llm.complete({
      system: SYSTEM_ANALYST,
      prompt: themesPrompt(items.map((i) => i.text)),
      schema: ThemesSchema,
      label: "report:themes",
      tier: "fast",
    });
    themes = buildThemes(grouped.data.themes, items, personas, reactions, evidence);
  }

  ctx.emit({ stage: "report", level: "info", message: "Writing readout" });
  const statsText = [
    ...(ensemble.samples > 1
      ? [`Across ${ensemble.samples} independent samples: negative ${withRange(ensemble.negativeShare, ensemble.samples)}, would leave ${withRange(ensemble.leaveShare, ensemble.samples)}. Figures below are from the median sample.`]
      : []),
    `Negative ${pct(stats.negativeShare)}, neutral ${pct(stats.neutralShare)}, positive ${pct(stats.positiveShare)}.`,
    `Would leave or switch: ${pct(stats.leaveShare)}.`,
    `Actions: ${Object.entries(stats.actions).map(([k, v]) => `${k} ${pct(v)}`).join(", ")}.`,
    `Changed stance between first and last round: ${pct(stats.movedMindShare)}.`,
  ].join("\n");
  const verdict = await ctx.llm.complete({
    system: SYSTEM_ANALYST,
    prompt: verdictPrompt({ seed: ctx.seed, statsText, themes, personas, evidence, lastReactions: lastRound }),
    schema: VerdictSchema,
    label: "report:verdict",
    tier: "strong",
  });

  const evIds = new Set(evidence.map((e) => e.id));
  const pIds = new Set(personas.map((p) => p.id));
  const recommendations = verdict.data.recommendations.map((r) => ({ ...r, evidenceIds: r.evidenceIds.filter((id) => evIds.has(id)) }));
  const riskiest = pIds.has(verdict.data.riskiest.personaId) ? verdict.data.riskiest : null;

  const domains = new Set(evidence.map((e) => e.domain));
  const grounded = evidence.length > 0;
  const conf = gradeConfidence(evidence.length, domains.size, grounded, ensemble);
  if (ctx.seed.asOf) {
    // Search and quotes respect the cut-off, but the model itself may remember what happened next.
    conf.reason += ` Backtest as of ${ctx.seed.asOf}: the model may already know the outcome, so compare against what really happened.`;
  }
  const usage = ctx.meter.snapshot();

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    runId: input.runId,
    createdAt: input.createdAt,
    seed: ctx.seed,
    headline: buildHeadline(ensemble, themes[0]?.label),
    readout: verdict.data.readout,
    stats,
    ensemble,
    themes,
    recommendations,
    riskiestSegment: riskiest,
    personas,
    reactions,
    evidence,
    basis: {
      grounded,
      evidenceCount: evidence.length,
      domainCount: domains.size,
      confidence: conf.level,
      confidenceReason: conf.reason,
      groundingProvider: input.groundingProvider,
      asOf: ctx.seed.asOf ?? null,
      droppedAfterCutoff: input.droppedAfterCutoff ?? 0,
      llmProvider: ctx.llm.id,
      models: ctx.llm.models,
    },
    usage: { ...usage, seconds: Math.round((Date.now() - input.startedAtMs) / 1000) },
  };
}
