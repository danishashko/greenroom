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
  type Segment,
} from "../schema.js";
import { pct, round } from "../util.js";
import type { Ctx } from "./context.js";

type Stats = Report["stats"];
type Theme = Report["themes"][number];

const ThemesSchema = z.object({
  themes: z
    .array(
      z.object({
        label: z.string().min(3),
        objectionNumbers: z.array(z.number().int().min(0)).min(1),
        evidenceIds: z.array(z.string()).max(3).default([]),
      }),
    )
    .max(8),
});

const VerdictSchema = z.object({
  readout: z.string().min(20),
  recommendations: z.array(RecommendationSchema).min(1).max(4),
  riskiest: z.object({ personaId: z.string(), why: z.string() }),
});

/** All headline numbers come from code, weighted by persona share. The model never writes a statistic. */
export function computeStats(personas: Persona[], reactions: Reaction[], rounds: number, segments: Segment[] = [], currency = "USD"): Stats {
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
  const bySeg = segmentResults(personas, last, segments);
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
    segments: bySeg,
    atRisk: atRiskFrom(bySeg, segments, currency),
  };
}

const leaves = (r: Reaction) => r.action === "churn" || r.action === "switch_competitor";

/** Per segment: the segment's own reaction split, turned into customers and revenue at risk. */
export function segmentResults(personas: Persona[], last: Reaction[], segments: Segment[]): Stats["segments"] {
  const total = segments.reduce((s, x) => s + x.customers, 0) || 1;
  return segments.map((seg) => {
    const members = personas.filter((p) => p.customerSegment === seg.name);
    const w = members.reduce((s, p) => s + p.weight, 0);
    const share = round(seg.customers / total, 4);
    // A segment without mrrAfter keeps today's price once any segment has one.
    const priced = segments.some((x) => x.mrrAfter !== undefined);
    const after = priced ? (seg.mrrAfter ?? seg.mrr ?? 0) : null;
    const now = seg.mrr ?? 0;
    const base = {
      name: seg.name,
      customers: seg.customers,
      mrr: seg.mrr ?? null,
      share,
      personaIds: members.map((p) => p.id),
      mrrAfter: after,
      breakEvenLeaveShare: after !== null && after > now ? round(1 - now / after) : null,
    };
    if (!members.length || w <= 0) return { ...base, negativeShare: null, leaveShare: null, customersAtRisk: null, mrrAtRisk: null, netMrrChange: null };
    let neg = 0;
    let leave = 0;
    for (const p of members) {
      const r = last.find((x) => x.personaId === p.id);
      if (!r) continue;
      if (r.stance < 0) neg += p.weight;
      if (leaves(r)) leave += p.weight;
    }
    const leaveShare = leave / w;
    return {
      ...base,
      negativeShare: round(neg / w),
      leaveShare: round(leaveShare),
      customersAtRisk: Math.round(leaveShare * seg.customers),
      mrrAtRisk: segments.some((x) => x.mrr !== undefined) ? Math.round(leaveShare * (seg.mrr ?? 0)) : null,
      // Those who stay pay the new price; those who leave pay nothing. Downgrades are not modeled.
      netMrrChange: after !== null ? Math.round((1 - leaveShare) * after - now) : null,
    };
  });
}

export function atRiskFrom(rows: Stats["segments"], segments: Segment[], currency: string): Stats["atRisk"] {
  if (!segments.length) return null;
  const totalCustomers = segments.reduce((s, x) => s + x.customers, 0) || 1;
  // A segment without mrr (a free plan) counts as zero revenue once any segment has mrr.
  const hasMrr = segments.some((x) => x.mrr !== undefined);
  const totalMrr = segments.reduce((s, x) => s + (x.mrr ?? 0), 0);
  const customers = rows.reduce((s, r) => s + (r.customersAtRisk ?? 0), 0);
  const mrr = hasMrr ? rows.reduce((s, r) => s + (r.mrrAtRisk ?? 0), 0) : null;
  return {
    customers,
    customerShare: round(customers / totalCustomers),
    mrr,
    mrrShare: mrr !== null && totalMrr > 0 ? round(mrr / totalMrr) : null,
    uncoveredCustomers: rows.filter((r) => r.leaveShare === null).reduce((s, r) => s + r.customers, 0),
    netMrrChange: rows.some((r) => r.netMrrChange !== null) ? rows.reduce((s, r) => s + (r.netMrrChange ?? 0), 0) : null,
    currency,
  };
}

export function money(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

/** "+$3,200" or "-$1,450". */
export function signedMoney(n: number, currency: string): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${money(Math.abs(n), currency)}`;
}

function range(values: number[], digits = 3): Ensemble["leaveShare"] {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? (v[mid] as number) : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
  return { median: round(median, digits), min: round(v[0] ?? 0, digits), max: round(v[v.length - 1] ?? 0, digits) };
}

/** Median and range across samples, plus which sample to show: the one closest to the median leave share. */
export function buildEnsemble(perSample: Stats[]): Ensemble {
  const rows = perSample.map((s) => ({
    negativeShare: s.negativeShare,
    positiveShare: s.positiveShare,
    leaveShare: s.leaveShare,
    meanStance: s.meanStance,
    customersAtRisk: s.atRisk?.customers ?? null,
    mrrAtRisk: s.atRisk?.mrr ?? null,
    netMrrChange: s.atRisk?.netMrrChange ?? null,
  }));
  const nums = (k: "customersAtRisk" | "mrrAtRisk" | "netMrrChange") => (rows.length && rows.every((r) => r[k] !== null) ? range(rows.map((r) => r[k] as number), 0) : null);
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
    customersAtRisk: nums("customersAtRisk"),
    mrrAtRisk: nums("mrrAtRisk"),
    netMrrChange: nums("netMrrChange"),
    perSample: rows,
  };
}

function withRange(r: Ensemble["leaveShare"], samples: number): string {
  if (samples < 2 || Math.round(r.min * 100) === Math.round(r.max * 100)) return pct(r.median);
  return `${pct(r.median)} (${Math.round(r.min * 100)} to ${pct(r.max)})`;
}

function countRange(r: Ensemble["leaveShare"], samples: number, fmt: (n: number) => string): string {
  if (samples < 2 || r.min === r.max) return fmt(r.median);
  return `${fmt(r.median)} (${fmt(r.min)} to ${fmt(r.max)})`;
}

/** "About 1,240 customers and $48,000 of monthly revenue at risk", with ranges across samples. Empty without segments. */
export function atRiskLine(e: Ensemble, currency: string): string {
  if (!e.customersAtRisk) return "";
  const netOnly = e.netMrrChange ? ` Net monthly revenue after the change: ${countRange(e.netMrrChange, e.samples, (n) => signedMoney(n, currency))}.` : "";
  if (e.customersAtRisk.max === 0) return `No customers would leave.${netOnly}`;
  const customers = countRange(e.customersAtRisk, e.samples, (n) => n.toLocaleString("en-US"));
  const mrr = e.mrrAtRisk ? ` and ${countRange(e.mrrAtRisk, e.samples, (n) => money(n, currency))} of monthly revenue` : "";
  const net = e.netMrrChange ? ` Net monthly revenue after the change: ${countRange(e.netMrrChange, e.samples, (n) => signedMoney(n, currency))}.` : "";
  return `That puts about ${customers} customers${mrr} at risk.${net}`;
}

/** Numbers first. With several samples, the medians lead and the range follows in brackets. */
export function buildHeadline(e: Ensemble, topTheme?: string, currency = "USD"): string {
  const leave = withRange(e.leaveShare, e.samples);
  const lead =
    e.negativeShare.median >= e.positiveShare.median
      ? `${withRange(e.negativeShare, e.samples)} of the audience reacts negatively and ${leave} would leave or switch.`
      : `${withRange(e.positiveShare, e.samples)} of the audience reacts positively and ${leave} would leave or switch.`;
  const risk = atRiskLine(e, currency);
  const out = risk ? `${lead} ${risk}` : lead;
  return topTheme ? `${out} Main objection: ${topTheme.toLowerCase()}.` : out;
}

/** Wide disagreement between samples is a confidence problem even when evidence is plentiful. */
export const SPREAD_LIMIT = 0.25;

export interface ConfidenceExtras {
  /** Quotes from the user's own customer data. Enough of them stand in for source variety. */
  customerQuotes?: number;
  /** Share of the customer base in segments no persona covered. */
  uncoveredShare?: number;
  /** Customer data without segment sizes: shares follow quote counts, which over-sample complainers. */
  unanchoredCustomers?: boolean;
}

export function gradeConfidence(
  evidenceCount: number,
  domainCount: number,
  grounded: boolean,
  ensemble?: Ensemble,
  extras: ConfidenceExtras = {},
): { level: Confidence; reason: string } {
  let level: Confidence;
  let reason: string;
  const own = extras.customerQuotes ?? 0;
  const basis = own ? `${evidenceCount} quotes (${own} from your customers) from ${domainCount} ${domainCount === 1 ? "source" : "sources"}` : `${evidenceCount} quotes from ${domainCount} domains`;
  if (!grounded) {
    level = "low";
    reason = "No source evidence. Personas were written by the model from the description.";
  } else if (evidenceCount < 12 || (domainCount < 3 && own < 12)) {
    level = "low";
    reason = `${basis} is thin.`;
  } else if (evidenceCount < 30 || (domainCount < 5 && own < 45)) {
    level = "medium";
    reason = `${basis}.`;
  } else {
    level = "high";
    reason = `${basis}.`;
  }
  const down = (l: Confidence): Confidence => (l === "high" ? "medium" : "low");
  if ((extras.uncoveredShare ?? 0) > 0.1) {
    level = down(level);
    reason += ` Segments holding ${pct(extras.uncoveredShare ?? 0)} of customers had no persona.`;
  }
  if (extras.unanchoredCustomers) reason += " Audience shares follow quote counts; pass segments for shares that match your customer base.";
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
  grouped: { label: string; objectionNumbers: number[]; evidenceIds?: string[] }[],
  items: { personaId: string; text: string }[],
  personas: Persona[],
  reactions: Reaction[],
  evidence: Evidence[],
): Theme[] {
  const w = new Map(personas.map((p) => [p.id, p.weight]));
  const evById = new Map(evidence.map((e) => [e.id, e]));
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
    // Only quotes the grouping step matched to this objection. A theme with no matching quote shows
    // none, rather than whatever its personas happened to cite.
    const quotes: Theme["quotes"] = [];
    for (const eid of g.evidenceIds ?? []) {
      const e = evById.get(eid);
      if (e && !quotes.some((q) => q.evidenceId === eid) && quotes.length < 3) quotes.push({ evidenceId: eid, quote: e.quote, url: e.url });
    }
    themes.push({ label: g.label, weight, personaIds, quotes });
  }
  return themes.sort((a, b) => b.weight - a.weight);
}

/** Quotes the shown personas were built from or cited, in that order, as candidates for theme quotes. */
function themeCandidates(personas: Persona[], reactions: Reaction[], evidence: Evidence[], max = 60): Evidence[] {
  const ids = new Set([...reactions.flatMap((r) => r.evidenceIds), ...personas.flatMap((p) => p.evidenceIds)]);
  return evidence.filter((e) => ids.has(e.id)).slice(0, max);
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
  const segments = ctx.seed.segments ?? [];
  const currency = ctx.seed.currency ?? "USD";
  const perSample = input.samples.map((s) => computeStats(s.personas, s.reactions, ctx.rounds, segments, currency));
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
      prompt: themesPrompt(items.map((i) => i.text), themeCandidates(personas, reactions, evidence)),
      schema: ThemesSchema,
      label: "report:themes",
      tier: "strong",
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
    ...(stats.segments.length
      ? [
          `By customer segment: ${stats.segments
            .map((x) =>
              x.leaveShare === null
                ? `${x.name} not covered`
                : `${x.name} (${x.customers} customers) negative ${pct(x.negativeShare ?? 0)}, would leave ${pct(x.leaveShare)}${
                    x.netMrrChange !== null ? `, net monthly revenue ${signedMoney(x.netMrrChange, currency)}` : ""
                  }${x.breakEvenLeaveShare !== null ? `, breaks even if under ${pct(x.breakEvenLeaveShare)} leave` : ""}`,
            )
            .join("; ")}.`,
          atRiskLine(ensemble, currency),
        ]
      : []),
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
  const customerQuotes = evidence.filter((e) => e.source === "customer").length;
  const totalCustomers = segments.reduce((s, x) => s + x.customers, 0);
  const uncoveredShare = stats.atRisk && totalCustomers ? stats.atRisk.uncoveredCustomers / totalCustomers : 0;
  const conf = gradeConfidence(evidence.length, domains.size, grounded, ensemble, {
    customerQuotes,
    uncoveredShare,
    unanchoredCustomers: customerQuotes > 0 && !segments.length,
  });
  const net = ensemble.netMrrChange;
  if (net && net.min < 0 && net.max > 0) {
    // Blended shares can agree while the bottom line flips sign between samples.
    conf.reason += ` Net revenue ranges from ${signedMoney(net.min, currency)} to ${signedMoney(net.max, currency)} across samples, so whether the change gains or loses revenue is not settled.`;
  }
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
    headline: buildHeadline(ensemble, themes[0]?.label, currency),
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
      customerQuotes,
      weighting: segments.length ? "segments" : "evidence",
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
