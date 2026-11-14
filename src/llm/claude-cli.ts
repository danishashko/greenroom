import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GreenroomError } from "../errors.js";
import { BaseProvider, type BaseOptions } from "./base.js";
import type { ProviderCheck, RawRequest, RawResult } from "./types.js";

/**
 * Uses the user's own logged-in `claude` CLI (Claude Code), so a Claude subscription
 * works with no API key. We never read, copy or store any credential.
 *
 * Every call is isolated: empty working dir, no tools, no MCP servers, no skills,
 * no settings or CLAUDE.md. Without this a default Claude Code call can load
 * hundreds of thousands of tokens of personal context per request. `--bare` is
 * avoided on purpose, because it disables subscription login.
 */
export function buildClaudeArgs(opts: { schemaJson: Record<string, unknown>; system: string; model?: string; effort?: string }): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(opts.schemaJson),
    "--no-session-persistence",
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--disable-slash-commands",
    "--setting-sources",
    "",
    "--system-prompt",
    opts.system,
    "--max-turns",
    "3",
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.effort) args.push("--effort", opts.effort);
  return args;
}

const ISO_DIR = path.join(tmpdir(), "greenroom-claude-iso");

function isolatedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // A stray API key would silently switch billing away from the subscription.
  if (process.env["GREENROOM_CLAUDE_USE_API_KEY"] !== "1") delete env["ANTHROPIC_API_KEY"];
  return env;
}

interface CliRun {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runCli(bin: string, args: string[], stdin: string | null, timeoutMs: number): Promise<CliRun> {
  mkdirSync(ISO_DIR, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: ISO_DIR, env: isolatedEnv(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new GreenroomError("PROVIDER_UNAVAILABLE", `${bin} timed out after ${Math.round(timeoutMs / 1000)}s.`, "Raise GREENROOM_CLI_TIMEOUT_MS or lower --personas."));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new GreenroomError(
          "PROVIDER_UNAVAILABLE",
          e.code === "ENOENT" ? `\`${bin}\` was not found on PATH.` : `Could not start \`${bin}\`: ${e.message}`,
          "Install Claude Code and run `claude` once to log in, or pick another provider with --llm.",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
    if (stdin !== null) child.stdin.write(stdin);
    child.stdin.end();
  });
}

export class ClaudeCliProvider extends BaseProvider {
  id = "claude-cli";
  label = "Claude Code CLI (uses your Claude subscription)";
  kind = "subscription" as const;
  concurrency = Number(process.env["GREENROOM_CLI_CONCURRENCY"] ?? 3);
  models: { fast: string; strong: string };
  private bin: string;
  private timeoutMs: number;
  private effort?: string;

  constructor(opts: BaseOptions = {}) {
    super(opts);
    this.models = {
      fast: opts.models?.fast ?? process.env["GREENROOM_MODEL_FAST"] ?? "sonnet",
      strong: opts.models?.strong ?? process.env["GREENROOM_MODEL_STRONG"] ?? "opus",
    };
    this.bin = process.env["GREENROOM_CLAUDE_BIN"] ?? "claude";
    this.timeoutMs = Number(process.env["GREENROOM_CLI_TIMEOUT_MS"] ?? 240_000);
    this.effort = process.env["GREENROOM_EFFORT"];
  }

  async check(deep = false): Promise<ProviderCheck> {
    try {
      const v = await runCli(this.bin, ["--version"], null, 15_000);
      if (v.code !== 0) return { ok: false, detail: v.stderr.trim() || "claude --version failed" };
      const version = v.stdout.trim();
      if (!deep) return { ok: true, detail: `${version}. Login not tested; run \`greenroom doctor --deep\` for a live call.` };
      const r = await this.raw({
        system: "Reply with the requested JSON only.",
        prompt: "Return ok=true.",
        schemaJson: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
        model: this.models.fast,
      });
      return { ok: true, detail: `${version}. Live call ok, ${r.usage.inputTokens} input tokens.` };
    } catch (e) {
      const err = e instanceof GreenroomError ? e : new GreenroomError("PROVIDER_UNAVAILABLE", String(e));
      return { ok: false, detail: err.message, hint: err.hint };
    }
  }

  protected async raw(req: RawRequest): Promise<RawResult> {
    const args = buildClaudeArgs({ schemaJson: req.schemaJson, system: req.system, model: req.model, effort: this.effort });
    const run = await runCli(this.bin, args, req.prompt, this.timeoutMs);
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(run.stdout) as Record<string, unknown>;
    } catch {
      /* handled below */
    }
    if (!parsed) {
      throw new GreenroomError(
        "PROVIDER_UNAVAILABLE",
        // No JSON at all means the process died (Windows reports crashes as codes like 3221226505).
        // Login problems still print JSON with is_error, so this case is safe to retry.
        `claude crashed (exit code ${run.code}) without output. ${run.stderr.trim().slice(0, 300)}`,
        "Run `claude` in a terminal to confirm you are logged in.",
      );
    }
    if (parsed["is_error"] === true) {
      const msg = String(parsed["result"] ?? parsed["subtype"] ?? "unknown error").slice(0, 300);
      throw new GreenroomError("PROVIDER_UNAVAILABLE", `claude returned an error: ${msg}`, "Check your login and plan limits with `claude`.");
    }
    const u = (parsed["usage"] ?? {}) as Record<string, number>;
    const input = (u["input_tokens"] ?? 0) + (u["cache_creation_input_tokens"] ?? 0) + (u["cache_read_input_tokens"] ?? 0);
    const usage = {
      inputTokens: input,
      outputTokens: u["output_tokens"] ?? 0,
      listPriceUsd: typeof parsed["total_cost_usd"] === "number" ? (parsed["total_cost_usd"] as number) : undefined,
    };
    if (parsed["structured_output"] !== undefined && parsed["structured_output"] !== null) {
      return { json: parsed["structured_output"], usage };
    }
    return { text: String(parsed["result"] ?? ""), usage };
  }
}
