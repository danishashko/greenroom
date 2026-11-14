import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GreenroomError } from "./errors.js";
import { shortHash } from "./util.js";

/** One folder per run. Every stage writes a checkpoint, so a failed run can resume. */
export class RunStore {
  private constructor(
    public readonly dir: string,
    public readonly runId: string,
  ) {}

  static create(baseDir: string, seedText: string): RunStore {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const runId = `${stamp}-${shortHash(seedText + d.getTime())}`;
    const dir = path.resolve(baseDir, runId);
    mkdirSync(dir, { recursive: true });
    return new RunStore(dir, runId);
  }

  static open(baseDir: string, runId: string): RunStore {
    const dir = path.resolve(baseDir, runId);
    if (!existsSync(dir)) throw new GreenroomError("NOT_FOUND", `No run "${runId}" in ${path.resolve(baseDir)}.`, "List runs with `greenroom runs`.");
    return new RunStore(dir, runId);
  }

  file(name: string): string {
    return path.join(this.dir, name);
  }

  has(name: string): boolean {
    return existsSync(this.file(name));
  }

  read<T>(name: string): T {
    return JSON.parse(readFileSync(this.file(name), "utf8")) as T;
  }

  write(name: string, data: unknown): void {
    writeFileSync(this.file(name), typeof data === "string" ? data : JSON.stringify(data, null, 2), "utf8");
  }
}

export interface RunSummary {
  runId: string;
  createdAt?: string;
  status: "complete" | "incomplete";
  change?: string;
  headline?: string;
}

export function listRuns(baseDir: string): RunSummary[] {
  const root = path.resolve(baseDir);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((n) => existsSync(path.join(root, n, "manifest.json")))
    .sort()
    .reverse()
    .map((runId) => {
      const store = RunStore.open(baseDir, runId);
      const manifest = store.read<{ createdAt?: string; seed?: { change?: string } }>("manifest.json");
      if (store.has("report.json")) {
        const r = store.read<{ headline?: string }>("report.json");
        return { runId, createdAt: manifest.createdAt, status: "complete" as const, change: manifest.seed?.change, headline: r.headline };
      }
      return { runId, createdAt: manifest.createdAt, status: "incomplete" as const, change: manifest.seed?.change };
    });
}
