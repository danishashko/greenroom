import type { z } from "zod";
import { GreenroomError } from "./errors.js";
import { loadCustomerData, type CustomerColumns } from "./ground/customers.js";
import { resolveGround, type GroundChoice } from "./ground/index.js";
import type { GroundProvider } from "./ground/types.js";
import { resolveProvider } from "./llm/index.js";
import type { LlmProvider } from "./llm/types.js";
import { Meter } from "./meter.js";
import type { Ctx, RunEvent } from "./pipeline/context.js";
import { estimateRun, type Estimate } from "./pipeline/estimate.js";
import { groundStage, type GroundResult } from "./pipeline/ground.js";
import { personasStage } from "./pipeline/personas.js";
import { reportStage } from "./pipeline/report.js";
import { simulateStage } from "./pipeline/simulate.js";
import { renderHtml } from "./render/html.js";
import { renderMarkdown } from "./render/markdown.js";
import { SeedSchema, type Evidence, type Persona, type Reaction, type Report, type Seed } from "./schema.js";
import { RunStore } from "./store.js";

export interface RunOptions {
  /** Required for a new run. Ignored on resume, where the stored seed is used. */
  seed?: z.input<typeof SeedSchema>;
  llm?: string;
  models?: { fast?: string; strong?: string };
  ground?: GroundChoice;
  urls?: string[];
  evidencePaths?: string[];
  /** First-party customer text (csv, tsv, json, jsonl): support tickets, survey comments, call notes, churn reasons. */
  customerPaths?: string[];
  /** Column names in the customer data. Detected from common names when left out. */
  customerColumns?: CustomerColumns;
  maxQueries?: number;
  maxPages?: number;
  country?: string;
  personas?: number;
  rounds?: number;
  /** Independent persona sets and simulations on the same evidence. Results report median and range. */
  samples?: number;
  maxCalls?: number;
  allowUngrounded?: boolean;
  outDir?: string;
  resume?: string;
  onEvent?: (e: RunEvent) => void;
  /** Library use and tests: bring your own backends instead of resolving by id. */
  llmProvider?: LlmProvider;
  groundProvider?: GroundProvider | null;
}

export const DEFAULTS = { maxQueries: 6, maxPages: 12, personas: 8, rounds: 3, samples: 3, outDir: ".greenroom/runs" } as const;

export interface RunResult {
  runId: string;
  dir: string;
  files: { report: string; markdown: string; html: string };
  report: Report;
  warnings: string[];
}

function validate(o: { personas: number; rounds: number; samples: number }): void {
  if (!Number.isInteger(o.samples) || o.samples < 1 || o.samples > 7) throw new GreenroomError("USAGE", "--samples must be between 1 and 7.");
  if (o.personas < 3 || o.personas > 16) throw new GreenroomError("USAGE", "--personas must be between 3 and 16.");
  if (o.rounds < 1 || o.rounds > 5) throw new GreenroomError("USAGE", "--rounds must be between 1 and 5.");
}

export function parseSeed(input: unknown): Seed {
  const r = SeedSchema.safeParse(input);
  if (!r.success) {
    throw new GreenroomError(
      "USAGE",
      `Invalid seed: ${r.error.issues.map((i) => `${i.path.join(".") || "change"}: ${i.message}`).join("; ")}`,
      'Pass the change as text, for example: greenroom run "Raise Pro from $49 to $79 per month".',
    );
  }
  return r.data;
}

/** "Free=12000,Pro=3400:98000" to segment objects. Revenue after the colon is optional. */
export function parseSegments(spec: string): { name: string; customers: number; mrr?: number }[] {
  return spec
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(.+?)\s*=\s*([\d_]+)(?:\s*:\s*([\d_.]+))?(?:\s*:\s*([\d_.]+))?$/.exec(part);
      if (!m) throw new GreenroomError("USAGE", `Cannot read segment "${part}".`, 'Use name=customers, name=customers:mrr or name=customers:mrr:mrrAfter, for example "Pro=3400:98000:132000".');
      const customers = Number((m[2] as string).replace(/_/g, ""));
      return { name: (m[1] as string).trim(), customers, ...(m[3] ? { mrr: Number(m[3].replace(/_/g, "")) } : {}), ...(m[4] ? { mrrAfter: Number(m[4].replace(/_/g, "")) } : {}) };
    });
}

/** Pre-flight: provider checks and the call/token estimate. Spends nothing. */
export function planRun(opts: Pick<RunOptions, "llm" | "models" | "ground" | "urls" | "maxQueries" | "maxPages" | "personas" | "rounds" | "samples">): {
  estimate: Estimate;
  llm: { id: string; kind: string; models: { fast: string; strong: string } };
  ground: string;
} {
  const personas = opts.personas ?? DEFAULTS.personas;
  const rounds = opts.rounds ?? DEFAULTS.rounds;
  const samples = opts.samples ?? DEFAULTS.samples;
  validate({ personas, rounds, samples });
  const provider = resolveProvider({ id: opts.llm, meter: new Meter(Infinity), models: opts.models });
  const ground = resolveGround(opts.ground ?? "auto");
  const estimate = estimateRun({
    personas,
    rounds,
    samples,
    maxQueries: opts.maxQueries ?? DEFAULTS.maxQueries,
    maxPages: opts.maxPages ?? DEFAULTS.maxPages,
    urls: opts.urls?.length ?? 0,
    searchEnabled: !!ground?.canSearch,
    llm: provider,
  });
  return { estimate, llm: { id: provider.id, kind: provider.kind, models: provider.models }, ground: ground?.id ?? "none" };
}

export async function runRehearsal(opts: RunOptions): Promise<RunResult> {
  const outDir = opts.outDir ?? DEFAULTS.outDir;
  const startedAtMs = Date.now();

  // Resume reuses the stored seed and settings; flags only override the provider.
  let store: RunStore;
  let seed: Seed;
  let createdAt = new Date().toISOString();
  let stored: Partial<RunOptions> = {};
  if (opts.resume) {
    store = RunStore.open(outDir, opts.resume);
    const m = store.read<{ seed: Seed; createdAt: string; options: Partial<RunOptions> }>("manifest.json");
    seed = m.seed;
    createdAt = m.createdAt;
    stored = m.options;
  } else {
    if (!opts.seed) throw new GreenroomError("USAGE", "A seed with the change to rehearse is required.", 'Example: greenroom run "Raise Pro from $49 to $79 per month".');
    seed = parseSeed(opts.seed);
    // Bad customer files or column names fail now, before a run folder exists.
    if (opts.customerPaths?.length) loadCustomerData(opts.customerPaths, opts.customerColumns, seed.asOf);
    store = RunStore.create(outDir, seed.change);
  }

  // Saved samples were built with these values, so a resume keeps them. Samples can grow.
  const personasN = (opts.resume ? stored.personas : undefined) ?? opts.personas ?? DEFAULTS.personas;
  const rounds = (opts.resume ? stored.rounds : undefined) ?? opts.rounds ?? DEFAULTS.rounds;
  const samples = opts.samples ?? stored.samples ?? DEFAULTS.samples;
  validate({ personas: personasN, rounds, samples });
  if ((seed.segments?.length ?? 0) > personasN) {
    throw new GreenroomError("USAGE", `${seed.segments?.length} segments need at least as many personas (got ${personasN}).`, "Raise --personas or merge small segments.");
  }
  if (new Set(seed.segments?.map((x) => x.name)).size !== (seed.segments?.length ?? 0)) throw new GreenroomError("USAGE", "Segment names must be unique.");

  const groundChoice = opts.ground ?? stored.ground ?? "auto";
  // A resumed run with saved evidence needs no grounding backend (or key) at all.
  const evidenceSaved = store.has("evidence.json");
  const groundProvider = opts.groundProvider !== undefined ? opts.groundProvider : evidenceSaved ? null : resolveGround(groundChoice);
  const groundOptions = {
    urls: opts.urls ?? stored.urls ?? [],
    evidencePaths: opts.evidencePaths ?? stored.evidencePaths ?? [],
    customerPaths: opts.customerPaths ?? stored.customerPaths ?? [],
    customerColumns: opts.customerColumns ?? stored.customerColumns,
    maxQueries: opts.maxQueries ?? stored.maxQueries ?? DEFAULTS.maxQueries,
    maxPages: opts.maxPages ?? stored.maxPages ?? DEFAULTS.maxPages,
    country: opts.country ?? stored.country,
  };

  // Resolve the provider once, size the call cap from the estimate, then attach the run's meter.
  const llm = opts.llmProvider ?? resolveProvider({ id: opts.llm ?? stored.llm, meter: new Meter(Number.POSITIVE_INFINITY), models: opts.models ?? stored.models });
  const est = estimateRun({
    personas: personasN,
    rounds,
    samples,
    maxQueries: groundOptions.maxQueries,
    maxPages: groundOptions.maxPages,
    urls: groundOptions.urls.length,
    searchEnabled: !!groundProvider?.canSearch,
    llm,
  });
  const meter = new Meter(opts.maxCalls ?? stored.maxCalls ?? est.suggestedMaxCalls);
  llm.attachMeter?.(meter);

  const emit = (e: Omit<RunEvent, "at">) => opts.onEvent?.({ at: new Date().toISOString(), ...e });
  const ctx: Ctx = {
    seed,
    llm,
    ground: groundProvider,
    meter,
    emit,
    groundOptions,
    personaCount: personasN,
    rounds,
    allowUngrounded: opts.allowUngrounded ?? stored.allowUngrounded ?? false,
  };

  store.write("manifest.json", {
    runId: store.runId,
    createdAt,
    seed,
    options: {
      llm: llm.id,
      models: llm.models,
      ground: groundChoice,
      ...groundOptions,
      personas: personasN,
      rounds,
      samples,
      // Only a cap the user chose is stored. An automatic cap is recomputed on resume, so
      // resuming with more samples or rounds is not blocked by the old estimate.
      maxCalls: opts.maxCalls ?? stored.maxCalls,
      allowUngrounded: ctx.allowUngrounded,
    },
  });
  emit({ stage: "setup", level: "info", message: `Run ${store.runId} using ${llm.id} (${llm.kind}) and grounding ${groundProvider?.id ?? "none"}`, data: { runId: store.runId, estimate: est } });
  if (llm.experimental) emit({ stage: "setup", level: "warn", message: `${llm.id} is an experimental adapter.` });

  // Usage adds up across resumed sessions and is saved even when a stage fails.
  type SavedUsage = Report["usage"];
  const priorUsage: SavedUsage = store.has("usage.json")
    ? store.read<SavedUsage>("usage.json")
    : { calls: 0, inputTokens: 0, outputTokens: 0, listPriceUsd: null, seconds: 0 };
  const totalUsage = (): SavedUsage => {
    const m = meter.snapshot();
    const price = m.listPriceUsd === null && priorUsage.listPriceUsd === null ? null : Math.round(((priorUsage.listPriceUsd ?? 0) + (m.listPriceUsd ?? 0)) * 10000) / 10000;
    return {
      calls: priorUsage.calls + m.calls,
      inputTokens: priorUsage.inputTokens + m.inputTokens,
      outputTokens: priorUsage.outputTokens + m.outputTokens,
      listPriceUsd: price,
      seconds: priorUsage.seconds + Math.round((Date.now() - startedAtMs) / 1000),
    };
  };

  let report: Report;
  let grounded: GroundResult;
  try {
    // Stage 1: evidence
    if (store.has("evidence.json")) {
      grounded = store.read<GroundResult>("evidence.json");
      emit({ stage: "ground", level: "info", message: `Reusing ${grounded.evidence.length} saved quotes` });
    } else {
      grounded = await groundStage(ctx);
      for (const w of grounded.warnings) emit({ stage: "ground", level: "warn", message: w });
      store.write("evidence.json", grounded);
    }
    emit({ stage: "ground", level: "info", message: `${grounded.evidence.length} quotes from ${new Set(grounded.evidence.map((e) => e.domain)).size} domains` });

    // Stages 2 and 3, once per sample. One run of personas plus simulation is noisy: the same
    // evidence can give 29% or 55% leaving. Independent samples turn that into a median and a range.
    const sampleRuns: { personas: Persona[]; reactions: Reaction[] }[] = [];
    for (let s = 0; s < samples; s++) {
      const tag = samples > 1 ? ` (sample ${s + 1} of ${samples})` : "";
      let personas: Persona[];
      if (store.has(`personas.s${s}.json`)) personas = store.read<Persona[]>(`personas.s${s}.json`);
      else {
        personas = await personasStage(ctx, grounded.evidence, grounded.productContext);
        store.write(`personas.s${s}.json`, personas);
      }

      let reactions: Reaction[];
      if (store.has(`reactions.s${s}.json`)) reactions = store.read<Reaction[]>(`reactions.s${s}.json`);
      else {
        // Finished rounds are saved as they complete, so a failure in round 3 keeps rounds 1 and 2.
        const partial = `reactions.s${s}.partial.json`;
        const prior = store.has(partial) ? store.read<Reaction[]>(partial) : [];
        if (prior.length) emit({ stage: "simulate", level: "info", message: `Reusing ${prior.length} saved reactions${tag}` });
        reactions = await simulateStage(ctx, personas, grounded.evidence as Evidence[], grounded.productContext, {
          prior,
          label: tag,
          onRound: (all) => store.write(partial, all),
        });
        store.write(`reactions.s${s}.json`, reactions);
      }
      sampleRuns.push({ personas, reactions });
    }

    // Stage 4: report
    report = await reportStage(ctx, {
      runId: store.runId,
      createdAt,
      startedAtMs,
      evidence: grounded.evidence,
      samples: sampleRuns,
      groundingProvider: groundProvider?.id ?? grounded.evidence.find((e) => e.via !== "user")?.via ?? "none",
      droppedAfterCutoff: grounded.droppedAfterCutoff,
    });
    report.usage = totalUsage();
    store.write("report.json", report);
    store.write("report.md", renderMarkdown(report));
    store.write("report.html", renderHtml(report));
    emit({ stage: "done", level: "info", message: report.headline, data: { runId: store.runId } });
  } finally {
    store.write("usage.json", totalUsage());
  }

  return {
    runId: store.runId,
    dir: store.dir,
    files: { report: store.file("report.json"), markdown: store.file("report.md"), html: store.file("report.html") },
    report,
    warnings: [...grounded.warnings, ...(grounded.skipped ?? [])],
  };
}
