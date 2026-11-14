#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { Command } from "commander";
import { DEFAULTS, parseSeed, planRun, runRehearsal, type RunOptions } from "./engine.js";
import { EXIT_CODES, GreenroomError, toGreenroomError } from "./errors.js";
import { resolveGround } from "./ground/index.js";
import { PROVIDERS, createProvider } from "./llm/index.js";
import { Meter } from "./meter.js";
import { ReportSchema, SeedSchema, jsonSchemaOf } from "./schema.js";
import { RunStore, listRuns } from "./store.js";
import { pct } from "./util.js";

const VERSION = "0.1.0";

interface Opts {
  kind?: string;
  product?: string;
  url?: string;
  audience?: string;
  competitor?: string[];
  context?: string;
  asOf?: string;
  seedFile?: string;
  llm?: string;
  modelFast?: string;
  modelStrong?: string;
  ground?: "auto" | "brightdata" | "local" | "none";
  urls?: string[];
  evidence?: string[];
  queries?: string;
  pages?: string;
  country?: string;
  personas?: string;
  rounds?: string;
  samples?: string;
  maxCalls?: string;
  allowUngrounded?: boolean;
  out?: string;
  resume?: string;
  json?: boolean;
  full?: boolean;
  quiet?: boolean;
  events?: boolean;
  open?: boolean;
}

function addRunOptions(cmd: Command): Command {
  return cmd
    .option("--kind <kind>", "pricing | launch | positioning | rebrand | feature | other")
    .option("--product <name>", "product or company name")
    .option("--url <url>", "public product or pricing page")
    .option("--audience <text>", "who buys it")
    .option("--competitor <name...>", "competitor names")
    .option("--context <text>", "extra context for the simulation")
    .option("--as-of <YYYY-MM-DD>", "backtest a past change: only use what was published by this date")
    .option("--seed-file <path>", "JSON file with the seed fields")
    .option("--llm <id>", "claude-cli | anthropic | openai | openrouter | ollama | lmstudio | openai-compatible | codex-cli | gemini-cli | auto")
    .option("--model-fast <name>", "model for extraction and persona turns")
    .option("--model-strong <name>", "model for persona design and the verdict")
    .option("--ground <mode>", "auto | brightdata | local | none (default auto)")
    .option("--urls <url...>", "pages to read as evidence")
    .option("--evidence <path...>", "files or folders of quotes (txt, md, json, csv)")
    .option("--queries <n>", `max search queries (default ${DEFAULTS.maxQueries})`)
    .option("--pages <n>", `max pages to read from search (default ${DEFAULTS.maxPages})`)
    .option("--country <cc>", "search country, 2 letters")
    .option("--personas <n>", `buyer personas, 3 to 16 (default ${DEFAULTS.personas})`)
    .option("--rounds <n>", `simulation rounds, 1 to 5 (default ${DEFAULTS.rounds})`)
    .option("--samples <n>", `independent persona sets, 1 to 7, reported as median and range (default ${DEFAULTS.samples})`)
    .option("--max-calls <n>", "hard cap on LLM calls")
    .option("--allow-ungrounded", "continue with model-written personas when no evidence is found")
    .option("--out <dir>", "run folder", process.env["GREENROOM_OUT"] ?? DEFAULTS.outDir)
    .option("--json", "machine-readable output on stdout")
    .option("--quiet", "no progress on stderr");
}

function toRunOptions(change: string | undefined, o: Opts): RunOptions {
  let seedInput: Record<string, unknown> = {};
  if (o.seedFile) {
    if (!existsSync(o.seedFile)) throw new GreenroomError("USAGE", `Seed file not found: ${o.seedFile}`);
    seedInput = JSON.parse(readFileSync(o.seedFile, "utf8")) as Record<string, unknown>;
  }
  // On resume the engine uses the stored seed, so no change text is needed.
  const seed = o.resume && !change && !o.seedFile ? undefined : parseSeed({
    ...seedInput,
    ...(change ? { change } : {}),
    ...(o.kind ? { kind: o.kind } : {}),
    ...(o.product ? { productName: o.product } : {}),
    ...(o.url ? { productUrl: o.url } : {}),
    ...(o.audience ? { audience: o.audience } : {}),
    ...(o.competitor ? { competitors: o.competitor } : {}),
    ...(o.context ? { context: o.context } : {}),
    ...(o.asOf ? { asOf: o.asOf } : {}),
  });
  const num = (v: string | undefined, name: string): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new GreenroomError("USAGE", `${name} must be a number.`);
    return n;
  };
  return {
    seed,
    llm: o.llm,
    models: { fast: o.modelFast, strong: o.modelStrong },
    ground: o.ground,
    urls: o.urls,
    evidencePaths: o.evidence,
    maxQueries: num(o.queries, "--queries"),
    maxPages: num(o.pages, "--pages"),
    country: o.country,
    personas: num(o.personas, "--personas"),
    rounds: num(o.rounds, "--rounds"),
    samples: num(o.samples, "--samples"),
    maxCalls: num(o.maxCalls, "--max-calls"),
    allowUngrounded: o.allowUngrounded,
    outDir: o.out,
    resume: o.resume,
  };
}

function print(json: boolean | undefined, data: unknown, human: () => string): void {
  if (json) process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  else process.stdout.write(`${human()}\n`);
}

function fail(e: unknown, json: boolean | undefined): never {
  const err = toGreenroomError(e);
  if (json) process.stdout.write(`${JSON.stringify({ ok: false, error: err.toJSON() }, null, 2)}\n`);
  else process.stderr.write(`Error [${err.code}]: ${err.message}${err.hint ? `\nHint: ${err.hint}` : ""}\n`);
  process.exit(EXIT_CODES[err.code]);
}

function openFile(file: string): void {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : process.platform === "darwin" ? ["open", [file]] : ["xdg-open", [file]];
  spawn(cmd as string, args as string[], { stdio: "ignore", detached: true }).unref();
}

const program = new Command();
program
  .name("greenroom")
  .description("Rehearse a launch, pricing change or repositioning against simulated buyers built from real conversations.")
  .version(VERSION)
  .showHelpAfterError("(run with --help for usage)");

addRunOptions(program.command("run").description("Run a full rehearsal").argument("[change...]", "the change in plain words"))
  .option("--resume <runId>", "continue a run from its last finished stage")
  .option("--full", "with --json, include the whole report instead of a summary")
  .option("--events", "stream progress as NDJSON on stderr")
  .option("--open", "open the HTML report when done")
  .action(async (change: string[], o: Opts) => {
    try {
      if (!change.length && !o.seedFile && !o.resume) throw new GreenroomError("USAGE", "Give the change to rehearse.", 'Example: greenroom run "Raise Pro from $49 to $79 per month" --audience "B2B marketing teams"');
      const opts = toRunOptions(change.join(" ") || undefined, o);
      const result = await runRehearsal({
        ...opts,
        onEvent: (e) => {
          if (o.quiet) return;
          if (o.events) process.stderr.write(`${JSON.stringify(e)}\n`);
          else process.stderr.write(`${e.level === "warn" ? "warn " : ""}[${e.stage}] ${e.message}\n`);
        },
      });
      const r = result.report;
      const summary = {
        ok: true,
        runId: result.runId,
        dir: result.dir,
        files: result.files,
        headline: r.headline,
        readout: r.readout,
        stats: r.stats,
        ensemble: r.ensemble,
        basis: r.basis,
        usage: r.usage,
        warnings: result.warnings,
      };
      print(o.json, o.full ? { ok: true, ...result, report: r } : summary, () =>
        [
          "",
          r.headline,
          "",
          r.readout,
          "",
          r.ensemble.samples > 1
            ? `Across ${r.ensemble.samples} samples (median, min to max): negative ${pct(r.ensemble.negativeShare.median)} (${pct(r.ensemble.negativeShare.min)} to ${pct(r.ensemble.negativeShare.max)}), leave ${pct(r.ensemble.leaveShare.median)} (${pct(r.ensemble.leaveShare.min)} to ${pct(r.ensemble.leaveShare.max)})`
            : `Negative ${pct(r.stats.negativeShare)}  Neutral ${pct(r.stats.neutralShare)}  Positive ${pct(r.stats.positiveShare)}  Leave ${pct(r.stats.leaveShare)}`,
          `Confidence: ${r.basis.confidence} (${r.basis.confidenceReason})`,
          "",
          ...r.recommendations.map((x, i) => `${i + 1}. ${x.change}`),
          "",
          `Report: ${result.files.html}`,
        ].join("\n"),
      );
      if (o.open) openFile(result.files.html);
    } catch (e) {
      fail(e, o.json);
    }
  });

addRunOptions(program.command("estimate").description("Show calls, tokens and time before spending anything").argument("[change...]"))
  .action((_change: string[], o: Opts) => {
    try {
      // The estimate depends on settings only, so the change text is optional here.
      const ro = toRunOptions(_change.join(" ") || "Estimate only, no change text given", { ...o, seedFile: undefined });
      const plan = planRun(ro);
      const e = plan.estimate;
      print(o.json, { ok: true, ...plan }, () =>
        [
          `Provider: ${plan.llm.id} (${plan.llm.kind}), grounding: ${plan.ground}`,
          `Calls: about ${e.calls.total} (${Object.entries(e.calls.breakdown).map(([k, v]) => `${k} ${v}`).join(", ")})`,
          `Tokens: about ${e.tokens.input.toLocaleString()} in, ${e.tokens.output.toLocaleString()} out`,
          `Time: about ${Math.round(e.seconds / 60)} min`,
          `Cost: ${e.cost.usd !== null ? `$${e.cost.usd}. ` : ""}${e.cost.note}`,
          `Suggested --max-calls: ${e.suggestedMaxCalls}`,
        ].join("\n"),
      );
    } catch (e) {
      fail(e, o.json);
    }
  });

program
  .command("doctor")
  .description("Check which LLM and grounding backends work on this machine")
  .option("--deep", "make one live call to each configured backend")
  .option("--json", "machine-readable output")
  .action(async (o: { deep?: boolean; json?: boolean }) => {
    const meter = new Meter(Number.POSITIVE_INFINITY);
    const llm = await Promise.all(
      PROVIDERS.map(async (p) => {
        try {
          const prov = createProvider(p.id, { meter });
          const c = await prov.check(o.deep);
          return { id: p.id, kind: p.kind, configured: true, ok: c.ok, detail: c.detail, hint: c.hint, experimental: p.experimental ?? false };
        } catch (e) {
          const err = toGreenroomError(e);
          return { id: p.id, kind: p.kind, configured: false, ok: false, detail: err.message, hint: err.hint ?? `Needs ${p.needs}.`, experimental: p.experimental ?? false };
        }
      }),
    );
    const groundList: { id: string; configured: boolean; ok: boolean; detail: string }[] = [];
    for (const g of ["brightdata", "local"] as const) {
      try {
        const prov = resolveGround(g);
        const c = prov ? await prov.check() : { ok: false, detail: "off" };
        groundList.push({ id: g, configured: true, ok: c.ok, detail: c.detail });
      } catch (e) {
        groundList.push({ id: g, configured: false, ok: false, detail: toGreenroomError(e).message });
      }
    }
    const firstOk = llm.find((l) => l.ok && !l.experimental);
    const data = { ok: !!firstOk, recommendedLlm: firstOk?.id ?? null, llm, ground: groundList };
    print(o.json, data, () =>
      [
        "LLM backends",
        ...llm.map((l) => `  ${l.ok ? "ok  " : "--  "}${l.id.padEnd(18)} ${l.detail}${l.ok || !l.hint ? "" : `  (${l.hint})`}`),
        "",
        "Grounding",
        ...groundList.map((g) => `  ${g.ok ? "ok  " : "--  "}${g.id.padEnd(18)} ${g.detail}`),
        "",
        firstOk ? `Recommended: --llm ${firstOk.id}` : "No working LLM backend yet.",
      ].join("\n"),
    );
    if (!firstOk) process.exit(EXIT_CODES.PROVIDER_UNAVAILABLE);
  });

program
  .command("providers")
  .description("List every supported LLM backend")
  .option("--json", "machine-readable output")
  .action((o: { json?: boolean }) => {
    print(o.json, { providers: PROVIDERS }, () => PROVIDERS.map((p) => `${p.id.padEnd(18)} ${p.kind.padEnd(13)} ${p.label}. Needs ${p.needs}${p.experimental ? " (experimental)" : ""}`).join("\n"));
  });

program
  .command("schema")
  .description("Print the JSON Schema of the seed or the report")
  .argument("[which]", "seed | report", "report")
  .action((which: string) => {
    if (which !== "seed" && which !== "report") fail(new GreenroomError("USAGE", 'Choose "seed" or "report".'), false);
    process.stdout.write(`${JSON.stringify(jsonSchemaOf(which === "seed" ? SeedSchema : ReportSchema), null, 2)}\n`);
  });

program
  .command("runs")
  .description("List saved runs")
  .option("--out <dir>", "run folder", process.env["GREENROOM_OUT"] ?? DEFAULTS.outDir)
  .option("--json", "machine-readable output")
  .action((o: { out: string; json?: boolean }) => {
    const runs = listRuns(o.out);
    print(o.json, { runs }, () => (runs.length ? runs.map((r) => `${r.runId}  ${r.status.padEnd(10)} ${r.headline ?? r.change ?? ""}`).join("\n") : "No runs yet."));
  });

program
  .command("show")
  .description("Print a saved report")
  .argument("<runId>")
  .option("--format <fmt>", "json | md | html | path", "md")
  .option("--out <dir>", "run folder", process.env["GREENROOM_OUT"] ?? DEFAULTS.outDir)
  .action((runId: string, o: { format: string; out: string }) => {
    try {
      const s = RunStore.open(o.out, runId);
      const name = { json: "report.json", md: "report.md", html: "report.html" }[o.format];
      if (o.format === "path") return void process.stdout.write(`${s.dir}\n`);
      if (!name) throw new GreenroomError("USAGE", "Format must be json, md, html or path.");
      if (!s.has(name)) throw new GreenroomError("NOT_FOUND", `Run ${runId} has no ${name}.`, `Resume it: greenroom run --resume ${runId}`);
      process.stdout.write(readFileSync(s.file(name), "utf8"));
    } catch (e) {
      fail(e, false);
    }
  });

program
  .command("guide")
  .description("Print the operating guide for AI agents (the same text the MCP server sends)")
  .action(async () => {
    const { AGENT_GUIDE } = await import("./guide.js");
    process.stdout.write(`${AGENT_GUIDE}
`);
  });

program
  .command("mcp")
  .description("Start the MCP server on stdio")
  .action(async () => {
    const { startMcpServer } = await import("./mcp.js");
    await startMcpServer();
  });

program.parseAsync(process.argv).catch((e) => fail(e, process.argv.includes("--json")));
