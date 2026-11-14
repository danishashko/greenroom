import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DEFAULTS, parseSeed, planRun, runRehearsal, type RunOptions, type RunResult } from "./engine.js";
import { GreenroomError, toGreenroomError } from "./errors.js";
import { resolveGround } from "./ground/index.js";
import { PROVIDERS, createProvider } from "./llm/index.js";
import { Meter } from "./meter.js";
import type { RunEvent } from "./pipeline/context.js";
import { RunStore, listRuns } from "./store.js";
import { sleep } from "./util.js";

const OUT_DIR = process.env["GREENROOM_OUT"] ?? DEFAULTS.outDir;
const VERSION = "0.1.0";

/** Fields shared by estimate and start. Descriptions are written for an agent choosing arguments. */
const runInput = {
  change: z.string().min(8).describe("The change to rehearse, in plain words. Example: raise Pro from $49 to $79 per month."),
  kind: z.enum(["pricing", "launch", "positioning", "rebrand", "feature", "other"]).optional().describe("Type of change. Improves persona prompts."),
  productName: z.string().optional().describe("Product or company name."),
  productUrl: z.string().url().optional().describe("Public product or pricing page. Read for product facts."),
  audience: z.string().optional().describe("Who buys it. The more specific, the better the personas."),
  competitors: z.array(z.string()).optional().describe("Competitor names buyers compare against."),
  context: z.string().optional().describe("Anything else the simulation must know."),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD. Backtest a past change using only what was published by this date. Compare the result with what really happened."),
  llm: z.string().optional().describe("Backend id. Omit to auto-detect. Call greenroom_doctor to see what works. 'claude-cli' uses the user's Claude subscription."),
  ground: z.enum(["auto", "brightdata", "local", "none"]).optional().describe("Where real quotes come from. auto uses Bright Data when a key exists."),
  urls: z.array(z.string().url()).optional().describe("Extra pages to read as evidence."),
  evidencePaths: z.array(z.string()).optional().describe("Local files or folders of quotes (txt, md, json, csv)."),
  personas: z.number().int().min(3).max(16).optional().describe("Number of buyer personas. Default 8."),
  rounds: z.number().int().min(1).max(5).optional().describe("Simulation rounds. Default 3."),
  samples: z.number().int().min(1).max(7).optional().describe("Independent persona sets on the same evidence, reported as median and range. Default 3. Use 1 for a quick look."),
  maxCalls: z.number().int().min(10).optional().describe("Hard cap on LLM calls. Default comes from the estimate."),
  allowUngrounded: z.boolean().optional().describe("Proceed with model-written personas when no evidence is found. Lowers confidence."),
};
type RunInput = { [K in keyof typeof runInput]: z.infer<(typeof runInput)[K]> };

function toOptions(i: RunInput): RunOptions {
  return {
    seed: parseSeed({ change: i.change, kind: i.kind, productName: i.productName, productUrl: i.productUrl, audience: i.audience, competitors: i.competitors, context: i.context, asOf: i.asOf }),
    llm: i.llm,
    ground: i.ground,
    urls: i.urls,
    evidencePaths: i.evidencePaths,
    personas: i.personas,
    rounds: i.rounds,
    samples: i.samples,
    maxCalls: i.maxCalls,
    allowUngrounded: i.allowUngrounded,
    outDir: OUT_DIR,
  };
}

function ok<T extends Record<string, unknown>>(data: T) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
}

function err(e: unknown) {
  const g = toGreenroomError(e);
  const data = { ok: false as const, error: g.toJSON() };
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
}

interface Job {
  runId?: string;
  status: "running" | "complete" | "failed";
  stage: string;
  events: RunEvent[];
  result?: RunResult;
  error?: ReturnType<GreenroomError["toJSON"]>;
  started: number;
  done: Promise<void>;
}
const jobs = new Map<string, Job>();
let seq = 0;

function summarize(r: RunResult["report"]) {
  return {
    headline: r.headline,
    readout: r.readout,
    stats: r.stats,
    ensemble: { samples: r.ensemble.samples, negativeShare: r.ensemble.negativeShare, leaveShare: r.ensemble.leaveShare, positiveShare: r.ensemble.positiveShare },
    confidence: { level: r.basis.confidence, reason: r.basis.confidenceReason },
    themes: r.themes.map((t) => ({ label: t.label, audienceShare: t.weight, quotes: t.quotes.map((q) => ({ quote: q.quote, url: q.url })) })),
    recommendations: r.recommendations,
    riskiestSegment: r.riskiestSegment,
    usage: r.usage,
  };
}

function jobView(key: string, j: Job) {
  return {
    ok: true as const,
    jobId: key,
    runId: j.runId ?? null,
    status: j.status,
    stage: j.stage,
    elapsedSeconds: Math.round((Date.now() - j.started) / 1000),
    recentEvents: j.events.slice(-5).map((e) => `[${e.stage}] ${e.message}`),
    summary: j.result ? summarize(j.result.report) : null,
    error: j.error ?? null,
  };
}

async function waitFor(j: Job, seconds: number): Promise<void> {
  const end = Date.now() + Math.min(Math.max(seconds, 0), 55) * 1000;
  while (j.status === "running" && Date.now() < end) await sleep(500);
}

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name: "greenroom", version: VERSION });

  server.registerTool(
    "greenroom_doctor",
    {
      title: "Check backends",
      description:
        "List which LLM backends and grounding providers work on this machine. Call this first when unsure which `llm` value to pass. Spends nothing unless deep is true.",
      inputSchema: { deep: z.boolean().optional().describe("Make one live call per configured backend.") },
      outputSchema: {
        ok: z.boolean(),
        recommendedLlm: z.string().nullable(),
        llm: z.array(z.object({ id: z.string(), kind: z.string(), configured: z.boolean(), ok: z.boolean(), detail: z.string(), hint: z.string().optional() })),
        ground: z.array(z.object({ id: z.string(), configured: z.boolean(), ok: z.boolean(), detail: z.string() })),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ deep }) => {
      const meter = new Meter(Number.POSITIVE_INFINITY);
      const llm = await Promise.all(
        PROVIDERS.map(async (p) => {
          try {
            const c = await createProvider(p.id, { meter }).check(deep);
            return { id: p.id, kind: p.kind, configured: true, ok: c.ok, detail: c.detail, hint: c.hint };
          } catch (e) {
            const g = toGreenroomError(e);
            return { id: p.id, kind: p.kind, configured: false, ok: false, detail: g.message, hint: g.hint ?? `Needs ${p.needs}.` };
          }
        }),
      );
      const ground = [];
      for (const g of ["brightdata", "local"] as const) {
        try {
          const prov = resolveGround(g);
          const c = prov ? await prov.check() : { ok: false, detail: "off" };
          ground.push({ id: g, configured: true, ok: c.ok, detail: c.detail });
        } catch (e) {
          ground.push({ id: g, configured: false, ok: false, detail: toGreenroomError(e).message });
        }
      }
      const first = llm.find((l) => l.ok && l.id !== "codex-cli" && l.id !== "gemini-cli");
      return ok({ ok: !!first, recommendedLlm: first?.id ?? null, llm, ground });
    },
  );

  server.registerTool(
    "greenroom_estimate",
    {
      title: "Estimate a run",
      description: "Predict calls, tokens and time for a rehearsal before starting it. Spends nothing. Call this before greenroom_start when the backend is a paid API.",
      inputSchema: runInput,
      outputSchema: {
        ok: z.boolean(),
        llm: z.object({ id: z.string(), kind: z.string() }),
        ground: z.string(),
        estimate: z.object({
          calls: z.object({ total: z.number(), breakdown: z.record(z.string(), z.number()) }),
          tokens: z.object({ input: z.number(), output: z.number() }),
          seconds: z.number(),
          cost: z.object({ kind: z.string(), note: z.string(), usd: z.number().nullable() }),
          suggestedMaxCalls: z.number(),
        }),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (i) => {
      try {
        const o = toOptions(i as RunInput);
        const plan = planRun(o);
        return ok({ ok: true, llm: { id: plan.llm.id, kind: plan.llm.kind }, ground: plan.ground, estimate: plan.estimate });
      } catch (e) {
        return err(e);
      }
    },
  );

  const jobOut = {
    ok: z.boolean(),
    jobId: z.string().optional(),
    runId: z.string().nullable().optional(),
    status: z.enum(["running", "complete", "failed"]).optional(),
    stage: z.string().optional(),
    elapsedSeconds: z.number().optional(),
    recentEvents: z.array(z.string()).optional(),
    summary: z.any().optional(),
    error: z.any().optional(),
  };

  server.registerTool(
    "greenroom_start",
    {
      title: "Start a rehearsal",
      description:
        "Start a rehearsal: collect real buyer quotes, build personas, simulate their reaction to the change, return a verdict. Takes 3 to 15 minutes, so it returns a jobId immediately (optionally waiting up to waitSeconds). Poll greenroom_status, then read greenroom_report.",
      inputSchema: { ...runInput, waitSeconds: z.number().int().min(0).max(55).optional().describe("Block this long for an early finish. Default 0.") },
      outputSchema: jobOut,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (i) => {
      try {
        if ([...jobs.values()].filter((j) => j.status === "running").length >= 2) {
          throw new GreenroomError("BUDGET_EXCEEDED", "Two rehearsals are already running.", "Wait for one to finish with greenroom_status.");
        }
        const opts = toOptions(i as RunInput);
        const key = `job${++seq}`;
        const job: Job = { status: "running", stage: "setup", events: [], started: Date.now(), done: Promise.resolve() };
        job.done = runRehearsal({
          ...opts,
          onEvent: (e) => {
            job.events.push(e);
            job.stage = e.stage;
            const id = (e.data as { runId?: string } | undefined)?.runId;
            if (id) job.runId = id;
          },
        })
          .then((r) => {
            job.result = r;
            job.runId = r.runId;
            job.status = "complete";
            job.stage = "done";
          })
          .catch((e) => {
            job.error = toGreenroomError(e).toJSON();
            job.status = "failed";
          });
        jobs.set(key, job);
        await waitFor(job, (i as { waitSeconds?: number }).waitSeconds ?? 0);
        return ok(jobView(key, job));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "greenroom_status",
    {
      title: "Check a rehearsal",
      description: "Status of a run started with greenroom_start. Pass waitSeconds to block until it finishes or the time passes. When status is complete, the summary is included.",
      inputSchema: { jobId: z.string().describe("jobId from greenroom_start."), waitSeconds: z.number().int().min(0).max(55).optional() },
      outputSchema: jobOut,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ jobId, waitSeconds }) => {
      const j = jobs.get(jobId);
      if (!j) return err(new GreenroomError("NOT_FOUND", `No job "${jobId}" in this server session.`, "Use greenroom_runs to find finished runs, or restart with CLI: greenroom run --resume <runId>."));
      await waitFor(j, waitSeconds ?? 0);
      return ok(jobView(jobId, j));
    },
  );

  server.registerTool(
    "greenroom_report",
    {
      title: "Read a report",
      description:
        "Read a finished run. format=summary (default) is small: headline, stats, themes, recommendations. format=full returns every persona, reaction and quote. format=markdown returns the written report. format=paths returns file locations.",
      inputSchema: { runId: z.string(), format: z.enum(["summary", "full", "markdown", "paths"]).optional() },
      outputSchema: { ok: z.boolean(), runId: z.string().optional(), format: z.string().optional(), data: z.any().optional(), error: z.any().optional() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ runId, format }) => {
      try {
        const s = RunStore.open(OUT_DIR, runId);
        if (!s.has("report.json")) throw new GreenroomError("NOT_FOUND", `Run ${runId} has no report yet.`, `Resume it with the CLI: greenroom run --resume ${runId}`);
        const f = format ?? "summary";
        if (f === "markdown") return ok({ ok: true, runId, format: f, data: readFileSync(s.file("report.md"), "utf8") });
        const report = s.read<RunResult["report"]>("report.json");
        if (f === "paths") return ok({ ok: true, runId, format: f, data: { dir: s.dir, json: s.file("report.json"), markdown: s.file("report.md"), html: s.file("report.html") } });
        return ok({ ok: true, runId, format: f, data: f === "full" ? report : summarize(report) });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "greenroom_runs",
    {
      title: "List runs",
      description: "List saved rehearsals, newest first.",
      inputSchema: {},
      outputSchema: { ok: z.boolean(), runs: z.array(z.object({ runId: z.string(), status: z.string(), createdAt: z.string().optional(), change: z.string().optional(), headline: z.string().optional() })) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => ok({ ok: true, runs: listRuns(OUT_DIR) }),
  );

  await server.connect(new StdioServerTransport());
}
