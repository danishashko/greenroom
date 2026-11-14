import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GreenroomError } from "../errors.js";
import { BaseProvider, withSchemaInPrompt, type BaseOptions } from "./base.js";
import type { ProviderCheck, RawRequest, RawResult } from "./types.js";

export interface CliTextConfig extends BaseOptions {
  id: string;
  label: string;
  bin: string;
  args: string[];
  modelFlag?: string;
  defaultModel?: string;
}

/**
 * Generic adapter for agent CLIs that take a prompt on stdin and print text:
 * Codex CLI (ChatGPT plan), Gemini CLI (Google login). Output is parsed as JSON
 * and repaired by the shared loop. Experimental: flags differ between versions.
 */
export class CliTextProvider extends BaseProvider {
  id: string;
  label: string;
  kind = "subscription" as const;
  concurrency = 2;
  experimental = true;
  models: { fast: string; strong: string };
  private cfg: CliTextConfig;

  constructor(cfg: CliTextConfig) {
    super(cfg);
    this.cfg = cfg;
    this.id = cfg.id;
    this.label = cfg.label;
    const fast = cfg.models?.fast ?? cfg.defaultModel ?? "";
    this.models = { fast, strong: cfg.models?.strong ?? fast };
  }

  private run(args: string[], stdin: string | null, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const cwd = path.join(tmpdir(), `greenroom-${this.id}-iso`);
    mkdirSync(cwd, { recursive: true });
    return new Promise((resolve, reject) => {
      const child = spawn(this.cfg.bin, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new GreenroomError("PROVIDER_UNAVAILABLE", `${this.cfg.bin} timed out.`));
      }, timeoutMs);
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(new GreenroomError("PROVIDER_UNAVAILABLE", e.code === "ENOENT" ? `\`${this.cfg.bin}\` was not found on PATH.` : e.message));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });
      if (stdin !== null) child.stdin.write(stdin);
      child.stdin.end();
    });
  }

  async check(): Promise<ProviderCheck> {
    try {
      const r = await this.run(["--version"], null, 15_000);
      return { ok: r.code === 0, detail: r.code === 0 ? `${r.stdout.trim()} (experimental adapter)` : r.stderr.trim() || "version check failed" };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  protected async raw(req: RawRequest): Promise<RawResult> {
    const args = [...this.cfg.args];
    if (this.cfg.modelFlag && req.model) args.push(this.cfg.modelFlag, req.model);
    const prompt = `${req.system}\n\n${withSchemaInPrompt(req.prompt, req.schemaJson)}`;
    const r = await this.run(args, prompt, Number(process.env["GREENROOM_CLI_TIMEOUT_MS"] ?? 240_000));
    if (r.code !== 0 && !r.stdout.trim()) {
      throw new GreenroomError("PROVIDER_UNAVAILABLE", `${this.cfg.bin} exited ${r.code}: ${r.stderr.trim().slice(0, 300)}`);
    }
    return { text: r.stdout, usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: Math.ceil(r.stdout.length / 4) } };
  }
}
