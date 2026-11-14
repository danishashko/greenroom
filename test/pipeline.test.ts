import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runRehearsal } from "../src/engine.js";
import { GreenroomError } from "../src/errors.js";
import { ReportSchema } from "../src/schema.js";
import { MockGround, MockProvider } from "./helpers.js";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "greenroom-test-"));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const seed = { change: "Raise Pro from $49 to $79 per month", kind: "pricing" as const, productName: "Acme" };

describe("full pipeline with mock backends", () => {
  it("produces a schema-valid, grounded report and all three files", async () => {
    const out = tmp();
    const llm = new MockProvider();
    const res = await runRehearsal({ seed, llmProvider: llm, groundProvider: new MockGround(), outDir: out, personas: 4, rounds: 3, maxPages: 5 });

    expect(() => ReportSchema.parse(res.report)).not.toThrow();
    const r = res.report;

    // Invented quotes are dropped: only the verbatim one per page survives.
    expect(r.evidence.length).toBe(5);
    expect(r.evidence.every((e) => e.quote.startsWith("We pay for this tool"))).toBe(true);
    expect(r.basis.domainCount).toBe(5);

    // Fake evidence ids from the model are stripped everywhere.
    const ids = new Set(r.evidence.map((e) => e.id));
    expect(r.personas.every((p) => p.evidenceIds.every((id) => ids.has(id)))).toBe(true);
    expect(r.reactions.every((x) => x.evidenceIds.every((id) => ids.has(id)))).toBe(true);
    expect(r.recommendations[0]!.evidenceIds).toEqual(["e1"]);

    expect(r.personas).toHaveLength(4);
    expect(r.personas.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 2);
    expect(r.reactions).toHaveLength(4 * 3);
    expect(r.headline).toMatch(/^\d+% of the audience/);
    expect(r.themes[0]!.label).toBe("Price rise too steep");

    // Round 2 prompts show what the other personas said in round 1.
    expect(llm.prompts.some((p) => p.includes("What others said so far:"))).toBe(true);

    for (const f of [res.files.report, res.files.markdown, res.files.html]) expect(readFileSync(f, "utf8").length).toBeGreaterThan(500);
    const html = readFileSync(res.files.html, "utf8");
    expect(html).toContain("#091B36");
    expect(html).toContain('id="report-data"');
    expect(html).not.toContain("<script>alert");
  });

  it("repairs invalid model output once and still finishes", async () => {
    const llm = new MockProvider();
    llm.failFirstPersonaCall = true;
    const res = await runRehearsal({ seed, llmProvider: llm, groundProvider: new MockGround(), outDir: tmp(), personas: 3, rounds: 1, maxPages: 3 });
    expect(res.report.personas).toHaveLength(3);
    expect(res.report.usage.calls).toBeGreaterThan(0);
  });

  it("stops before spending past the call cap", async () => {
    await expect(runRehearsal({ seed, llmProvider: new MockProvider(), groundProvider: new MockGround(), outDir: tmp(), personas: 4, rounds: 3, maxPages: 5, maxCalls: 5 })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("refuses to invent personas when there is no evidence", async () => {
    await expect(runRehearsal({ seed, llmProvider: new MockProvider(), groundProvider: null, outDir: tmp(), personas: 4, rounds: 1 })).rejects.toMatchObject({ code: "INSUFFICIENT_EVIDENCE" });
  });

  it("runs ungrounded only when asked, with low confidence", async () => {
    const res = await runRehearsal({ seed, llmProvider: new MockProvider(), groundProvider: null, outDir: tmp(), personas: 4, rounds: 1, allowUngrounded: true });
    expect(res.report.basis.grounded).toBe(false);
    expect(res.report.basis.confidence).toBe("low");
  });

  it("uses user-supplied evidence files", async () => {
    const dir = tmp();
    const file = path.join(dir, "quotes.json");
    writeFileSync(file, JSON.stringify([{ quote: "I would cancel the day this goes above sixty dollars.", url: "https://forum.example.com/t/1" }, "Our finance team already flagged this tool as a cost to cut."]));
    const res = await runRehearsal({ seed, llmProvider: new MockProvider(), groundProvider: null, evidencePaths: [file], outDir: tmp(), personas: 3, rounds: 1 });
    expect(res.report.evidence).toHaveLength(2);
    expect(res.report.evidence[0]!.source).toBe("user");
  });

  it("resumes from saved stages without repeating them", async () => {
    const out = tmp();
    const first = new MockProvider();
    const a = await runRehearsal({ seed, llmProvider: first, groundProvider: new MockGround(), outDir: out, personas: 3, rounds: 1, maxPages: 3 });
    const second = new MockProvider();
    const b = await runRehearsal({ seed, llmProvider: second, groundProvider: new MockGround(), outDir: out, resume: a.runId });
    expect(b.runId).toBe(a.runId);
    // Only the report stage calls the model on resume.
    expect(second.prompts.length).toBe(2);
    expect(b.report.evidence).toEqual(a.report.evidence);
  });

  it("rejects bad input with a USAGE error", async () => {
    await expect(runRehearsal({ seed: { change: "x" }, llmProvider: new MockProvider(), outDir: tmp() })).rejects.toBeInstanceOf(GreenroomError);
  });
});

describe("round checkpoints", () => {
  it("keeps finished rounds when a later round fails, and resumes from there", async () => {
    const out = tmp();
    const llm = new MockProvider();
    llm.failOnRound = 2;
    let runId = "";
    await expect(
      runRehearsal({ seed, llmProvider: llm, groundProvider: new MockGround(), outDir: out, personas: 3, rounds: 3, samples: 1, maxPages: 3, onEvent: (e) => (runId = (e.data as { runId?: string })?.runId ?? runId) }),
    ).rejects.toThrow("permanent failure");
    const again = new MockProvider();
    const res = await runRehearsal({ seed, llmProvider: again, groundProvider: new MockGround(), outDir: out, resume: runId });
    expect(res.report.reactions).toHaveLength(9);
    // Round 1 was not repeated: only rounds 2 and 3 (3 personas each) plus 2 report calls.
    expect(again.prompts.filter((p) => p.includes("Round 1 of 3"))).toHaveLength(0);
    expect(again.prompts.length).toBe(3 * 2 + 2);
  });
});

describe("resume without grounding", () => {
  it("does not need a grounding backend when evidence is saved", async () => {
    const out = tmp();
    const a = await runRehearsal({ seed, llmProvider: new MockProvider(), groundProvider: new MockGround(), outDir: out, personas: 3, rounds: 1, samples: 1, maxPages: 3 });
    const prev = process.env["BRIGHTDATA_API_KEY"];
    delete process.env["BRIGHTDATA_API_KEY"];
    try {
      const b = await runRehearsal({ llmProvider: new MockProvider(), outDir: out, resume: a.runId, ground: "brightdata", samples: 2 });
      expect(b.report.ensemble.samples).toBe(2);
      expect(b.report.basis.groundingProvider).toBe("mock-ground");
    } finally {
      if (prev !== undefined) process.env["BRIGHTDATA_API_KEY"] = prev;
    }
  });
});

describe("resume with more samples", () => {
  it("recomputes an automatic call cap instead of reusing the old one", async () => {
    const out = tmp();
    const a = await runRehearsal({ seed, llmProvider: new MockProvider(), groundProvider: new MockGround(), outDir: out, personas: 3, rounds: 1, samples: 1, maxPages: 3 });
    const b = await runRehearsal({ llmProvider: new MockProvider(), groundProvider: new MockGround(), outDir: out, resume: a.runId, samples: 7, rounds: 3 });
    expect(b.report.ensemble.samples).toBe(7);
    // Rounds stay at the saved value, so every sample has a final round to count.
    expect(b.report.stats.rounds).toBe(1);
    expect(b.report.ensemble.perSample.every((s) => s.negativeShare + s.positiveShare <= 1)).toBe(true);
  });
});

describe("usage across resumes", () => {
  it("adds calls from the failed session to the resumed one", async () => {
    const out = tmp();
    const llm = new MockProvider();
    llm.failOnRound = 2;
    let runId = "";
    await expect(runRehearsal({ seed, llmProvider: llm, groundProvider: new MockGround(), outDir: out, personas: 3, rounds: 2, samples: 1, maxPages: 3, onEvent: (e) => (runId = (e.data as { runId?: string })?.runId ?? runId) })).rejects.toThrow();
    const b = await runRehearsal({ llmProvider: new MockProvider(), outDir: out, resume: runId });
    // First session: queries 1 + extract 3 + personas 1 + round 1 (3) + the failing round-2 calls. Second: round 2 (3) + report 2.
    expect(b.report.usage.calls).toBeGreaterThanOrEqual(1 + 3 + 1 + 3 + 3 + 2);
  });
});
