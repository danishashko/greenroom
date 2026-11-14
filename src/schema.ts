import { z } from "zod";

/** Bump when report.json changes shape. Agents can branch on it. */
export const REPORT_SCHEMA_VERSION = 2;

export const ChangeKind = z.enum(["pricing", "launch", "positioning", "rebrand", "feature", "other"]);
export type ChangeKind = z.infer<typeof ChangeKind>;

export const SeedSchema = z.object({
  change: z.string().min(8).describe("The change being rehearsed, in plain words. Example: raise Pro from $49 to $79 per month."),
  kind: ChangeKind.default("other").describe("Type of change."),
  productName: z.string().optional().describe("Product or company name."),
  productUrl: z.string().url().optional().describe("Public product or pricing page."),
  audience: z.string().optional().describe("Who buys it. Example: B2B marketing teams of 10 to 50 people."),
  competitors: z.array(z.string()).default([]).describe("Competitor names buyers compare against."),
  context: z.string().optional().describe("Anything else the simulation must know."),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
    .optional()
    .describe("Cut-off date for a fair backtest of a past change. Search only finds pages published by then, dated quotes after it are dropped, and personas are told it is that day."),
});
export type Seed = z.infer<typeof SeedSchema>;

export const SourceKind = z.enum(["reddit", "hackernews", "x", "review", "forum", "news", "linkedin", "web", "user"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const EvidenceSchema = z.object({
  id: z.string(),
  source: SourceKind,
  url: z.string(),
  domain: z.string(),
  quote: z.string(),
  context: z.string().optional(),
  date: z.string().optional().describe("YYYY-MM-DD when the source shows when it was written."),
  via: z.string().describe("Which grounding provider fetched it."),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const PriceSensitivity = z.enum(["low", "medium", "high"]);

export const PersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  segment: z.string(),
  summary: z.string(),
  goals: z.array(z.string()),
  objections: z.array(z.string()),
  priceSensitivity: PriceSensitivity,
  currentSolution: z.string(),
  evidenceIds: z.array(z.string()),
  weight: z.number().describe("Share of the audience, 0 to 1. Sums to 1 across personas."),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const Action = z.enum(["advocate", "upgrade", "stay", "delay", "downgrade", "switch_competitor", "churn", "ignore"]);
export type Action = z.infer<typeof Action>;

export const ReactionSchema = z.object({
  personaId: z.string(),
  round: z.number().int(),
  stance: z.number().int().min(-2).max(2).describe("-2 hostile, -1 negative, 0 neutral, 1 positive, 2 enthusiastic."),
  action: Action,
  switchTo: z.string().optional(),
  objections: z.array(z.string()),
  reasoning: z.string(),
  wouldChangeMindIf: z.string().optional(),
  evidenceIds: z.array(z.string()),
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const ThemeSchema = z.object({
  label: z.string(),
  weight: z.number().describe("Audience share raising this objection, 0 to 1."),
  personaIds: z.array(z.string()),
  quotes: z.array(z.object({ evidenceId: z.string(), quote: z.string(), url: z.string() })),
});

export const RecommendationSchema = z.object({
  change: z.string(),
  why: z.string(),
  expectedEffect: z.string(),
  evidenceIds: z.array(z.string()),
});

export const Confidence = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof Confidence>;

const Range = z.object({ median: z.number(), min: z.number(), max: z.number() });

export const SampleStatsSchema = z.object({
  negativeShare: z.number(),
  positiveShare: z.number(),
  leaveShare: z.number(),
  meanStance: z.number(),
});

export const EnsembleSchema = z.object({
  samples: z.number().describe("Independent persona sets and simulations run on the same evidence."),
  shownSample: z.number().describe("Index of the sample whose personas and reactions the report shows: the one closest to the median leave share."),
  negativeShare: Range,
  positiveShare: Range,
  leaveShare: Range,
  meanStance: Range,
  perSample: z.array(SampleStatsSchema),
});
export type Ensemble = z.infer<typeof EnsembleSchema>;

export const ReportSchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  runId: z.string(),
  createdAt: z.string(),
  seed: SeedSchema,
  headline: z.string().describe("One sentence, numbers first. Uses ensemble medians and ranges when samples > 1."),
  readout: z.string(),
  stats: z.object({
    personas: z.number(),
    rounds: z.number(),
    negativeShare: z.number(),
    neutralShare: z.number(),
    positiveShare: z.number(),
    meanStance: z.number(),
    leaveShare: z.number().describe("Weighted share choosing churn or switch_competitor."),
    actions: z.record(z.string(), z.number()),
    movedMindShare: z.number().describe("Weighted share whose stance changed between round 1 and the last round."),
  }),
  ensemble: EnsembleSchema,
  themes: z.array(ThemeSchema),
  recommendations: z.array(RecommendationSchema),
  riskiestSegment: z.object({ personaId: z.string(), why: z.string() }).nullable(),
  personas: z.array(PersonaSchema),
  reactions: z.array(ReactionSchema),
  evidence: z.array(EvidenceSchema),
  basis: z.object({
    grounded: z.boolean(),
    evidenceCount: z.number(),
    domainCount: z.number(),
    confidence: Confidence,
    confidenceReason: z.string(),
    groundingProvider: z.string(),
    asOf: z.string().nullable().describe("Cut-off date of a backtest, or null."),
    droppedAfterCutoff: z.number().describe("Quotes and pages left out because they are dated after asOf."),
    llmProvider: z.string(),
    models: z.object({ fast: z.string(), strong: z.string() }),
  }),
  usage: z.object({
    calls: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    listPriceUsd: z.number().nullable(),
    seconds: z.number(),
  }),
});
export type Report = z.infer<typeof ReportSchema>;

/** JSON Schema without the $schema key, for CLIs that choke on it. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js["$schema"];
  return js;
}
