import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseSeed, parseSegments, runRehearsal } from "../src/engine.js";
import { CUSTOMER_QUOTE_CAP, detectColumns, loadCustomerData, parseCsv, quoteFrom, toIsoDate } from "../src/ground/customers.js";
import { anchorWeights, promptEvidence } from "../src/pipeline/personas.js";
import { atRiskFrom, atRiskLine, buildEnsemble, computeStats, gradeConfidence, segmentResults } from "../src/pipeline/report.js";
import { ReportSchema, type Evidence, type Persona, type Reaction } from "../src/schema.js";
import { MockGround, MockProvider } from "./helpers.js";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "greenroom-cust-"));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, line breaks in fields, CRLF and a BOM", () => {
    const rows = parseCsv('﻿id,body,plan\r\n1,"Too expensive, honestly ""way"" too much",Pro\r\n2,"line one\nline two",Free\r\n');
    expect(rows).toEqual([
      { id: "1", body: 'Too expensive, honestly "way" too much', plan: "Pro" },
      { id: "2", body: "line one\nline two", plan: "Free" },
    ]);
  });
  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b\n1;2\n")).toEqual([{ a: "1", b: "2" }]);
    expect(parseCsv("a\tb\n1\t2\n")).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("customer columns and quotes", () => {
  it("finds text, segment and date columns by name, else the wordiest column", () => {
    expect(detectColumns([{ id: "1", Comment: "x", plan: "Pro", created_at: "2026-01-01" }])).toEqual({ text: "Comment", segment: "plan", date: "created_at" });
    expect(detectColumns([{ id: "1", what_they_said: "a long piece of customer text here", tag: "x" }]).text).toBe("what_they_said");
  });
  it("rejects a mapped column that does not exist", () => {
    expect(() => detectColumns([{ body: "x" }], { text: "message" })).toThrow(/not in the customer data/);
  });
  it("cuts long text at a sentence end and stays a verbatim prefix", () => {
    const long = `${"We love the product. ".repeat(10)}But the new price is far more than our budget allows and we will look elsewhere. ${"x".repeat(300)}`;
    const q = quoteFrom(long);
    expect(q.length).toBeLessThanOrEqual(400);
    expect(long.replace(/\s+/g, " ")).toContain(q);
    expect(q.endsWith(".")).toBe(true);
  });
  it("reads ISO, US and epoch dates", () => {
    expect(toIsoDate("2026-03-04T10:00:00Z")).toBe("2026-03-04");
    expect(toIsoDate("March 4, 2026")).toBe("2026-03-04");
    expect(toIsoDate(1772582400)).toBe("2026-03-04");
    expect(toIsoDate("")).toBeUndefined();
  });
});

describe("loadCustomerData", () => {
  it("redacts, drops rows after the cut-off, dedupes and spreads picks across segments", () => {
    const d = tmp();
    const rows = [
      "id,body,plan,created_at",
      '1,"Please email me at jo@acme.io, the price jump is too much for us",Pro,2026-01-02',
      "2,The price jump is too much for us and we may cancel,Free,2026-01-03",
      "3,The price jump is too much for us and we may cancel,Free,2026-01-04",
      "4,This was written after the cut-off and must be left out,Pro,2026-06-01",
      ...Array.from({ length: 120 }, (_, i) => `${i + 10},Free customer comment number ${i} about the plan limits,Free,2026-01-05`),
      ...Array.from({ length: 10 }, (_, i) => `${i + 200},Team customer comment number ${i} about seats,Team,2026-01-05`),
    ];
    writeFileSync(path.join(d, "tickets.csv"), rows.join("\n"));
    const c = loadCustomerData([d], {}, "2026-05-01");
    expect(c.rows).toBe(134);
    expect(c.dropped).toBe(1);
    expect(c.evidence.length).toBe(CUSTOMER_QUOTE_CAP);
    expect(c.evidence.every((e) => e.source === "customer" && e.domain === "customer-data")).toBe(true);
    expect(c.evidence.some((e) => e.quote.includes("jo@acme.io"))).toBe(false);
    expect(c.evidence.find((e) => e.quote.includes("[email]"))?.segment).toBe("Pro");
    // 134 rows, minus 1 after the cut-off, minus 1 duplicate.
    expect(c.warnings).toContain(`Used ${CUSTOMER_QUOTE_CAP} of 132 customer rows with text (spread across segments).`);
    // All 10 Team rows make it in despite 120 Free rows.
    expect(c.evidence.filter((e) => e.segment === "Team").length).toBe(10);
    expect(c.evidence[0]!.url).toMatch(/^customer:\/\/tickets\.csv#row\d+$/);
  });
  it("reads JSON arrays and JSONL", () => {
    const d = tmp();
    writeFileSync(path.join(d, "a.json"), JSON.stringify([{ comment: "The onboarding took us far too long to finish" }, "A plain string row that is long enough"]));
    writeFileSync(path.join(d, "b.jsonl"), `${JSON.stringify({ text: "Churned because the reporting was missing" })}\n`);
    expect(loadCustomerData([d]).evidence).toHaveLength(3);
  });
});

const p = (id: string, weight: number, customerSegment?: string): Persona => ({
  id,
  name: id,
  role: "r",
  segment: "s",
  summary: "x",
  goals: [],
  objections: [],
  priceSensitivity: "medium",
  currentSolution: "x",
  evidenceIds: [],
  weight,
  customerSegment,
});
const react = (personaId: string, stance: number, action: Reaction["action"]): Reaction => ({ personaId, round: 1, stance, action, objections: [], reasoning: "because", evidenceIds: [] });
const segments = [
  { name: "Free", customers: 6000 },
  { name: "Pro", customers: 3000, mrr: 90000 },
  { name: "Team", customers: 1000, mrr: 100000 },
];

describe("segment anchoring", () => {
  it("gives each segment its customer share, split by evidence weight inside the segment", () => {
    const { personas, uncovered } = anchorWeights([p("a", 0.3, "Free"), p("b", 0.1, "Free"), p("c", 0.5, "Pro"), p("d", 0.1, "Team")], segments);
    expect(uncovered).toEqual([]);
    expect(personas.map((x) => x.weight)).toEqual([0.45, 0.15, 0.3, 0.1]);
  });
  it("reports uncovered segments and renormalizes the rest", () => {
    const { personas, uncovered } = anchorWeights([p("a", 0.5, "Free"), p("c", 0.5, "Pro")], segments);
    expect(uncovered).toEqual(["Team"]);
    expect(personas.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 3);
    expect(personas[0]!.weight).toBeCloseTo(6 / 9, 3);
  });
  it("puts customer quotes first in the persona prompt", () => {
    const ev = (id: string, source: Evidence["source"], domain: string): Evidence => ({ id, source, domain, url: "u", quote: "q", via: "x" });
    const shown = promptEvidence([ev("e1", "reddit", "reddit.com"), ev("e2", "customer", "customer-data"), ev("e3", "review", "g2.com")], 2);
    expect(shown.map((e) => e.id)).toEqual(["e2", "e1"]);
  });
});

describe("customers and revenue at risk", () => {
  const personas = [p("a", 0.45, "Free"), p("b", 0.15, "Free"), p("c", 0.3, "Pro"), p("d", 0.1, "Team")];
  const last = [react("a", -1, "downgrade"), react("b", -2, "churn"), react("c", -2, "switch_competitor"), react("d", 1, "stay")];

  it("computes each segment from its own personas", () => {
    const rows = segmentResults(personas, last, segments);
    expect(rows[0]).toMatchObject({ name: "Free", share: 0.6, negativeShare: 1, leaveShare: 0.25, customersAtRisk: 1500, mrrAtRisk: 0 });
    expect(rows[1]).toMatchObject({ name: "Pro", leaveShare: 1, customersAtRisk: 3000, mrrAtRisk: 90000 });
    expect(rows[2]).toMatchObject({ name: "Team", leaveShare: 0, customersAtRisk: 0, mrrAtRisk: 0 });
    // Free has no mrr, so it counts as zero revenue.
    expect(atRiskFrom(rows, segments, "USD")).toMatchObject({ customers: 4500, customerShare: 0.45, mrr: 90000, mrrShare: 0.474, uncoveredCustomers: 0 });
    // Without any mrr there is no revenue figure at all.
    const noMrr = segments.map(({ mrr: _m, ...x }) => x);
    expect(atRiskFrom(segmentResults(personas, last, noMrr), noMrr, "USD").mrr).toBeNull();
  });

  it("totals revenue when every segment has mrr, and ranges it across samples", () => {
    const withMrr = segments.map((s) => ({ ...s, mrr: s.mrr ?? 0 }));
    const s1 = computeStats(personas, last, 1, withMrr);
    expect(s1.atRisk).toMatchObject({ customers: 4500, mrr: 90000, mrrShare: 0.474 });
    const s2 = computeStats(personas, [react("a", -1, "downgrade"), react("b", -1, "stay"), react("c", -2, "churn"), react("d", -2, "churn")], 1, withMrr);
    const e = buildEnsemble([s1, s2]);
    expect(e.customersAtRisk).toEqual({ median: 4250, min: 4000, max: 4500 });
    expect(e.mrrAtRisk).toEqual({ median: 140000, min: 90000, max: 190000 });
    expect(atRiskLine(e, "USD")).toBe("That puts about 4,250 (4,000 to 4,500) customers and $140,000 ($90,000 to $190,000) of monthly revenue at risk.");
  });

  it("has no at-risk figures without segments", () => {
    const s = computeStats(personas, last, 1);
    expect(s.segments).toEqual([]);
    expect(s.atRisk).toBeNull();
    expect(buildEnsemble([s]).customersAtRisk).toBeNull();
  });
});

describe("confidence with customer data", () => {
  it("counts customer quotes as source variety and flags unanchored shares and uncovered segments", () => {
    expect(gradeConfidence(20, 1, true).level).toBe("low");
    expect(gradeConfidence(20, 1, true, undefined, { customerQuotes: 15 }).level).toBe("medium");
    expect(gradeConfidence(40, 1, true, undefined, { customerQuotes: 35 }).level).toBe("medium");
    expect(gradeConfidence(50, 2, true, undefined, { customerQuotes: 45 }).level).toBe("high");
    expect(gradeConfidence(50, 2, true, undefined, { customerQuotes: 45, uncoveredShare: 0.3 }).level).toBe("medium");
    expect(gradeConfidence(40, 2, true, undefined, { customerQuotes: 35, unanchoredCustomers: true }).reason).toContain("pass segments");
  });
});

describe("parseSegments", () => {
  it("reads name=customers[:mrr]", () => {
    expect(parseSegments("Free=12_000, Pro plan=3400:98000.5")).toEqual([
      { name: "Free", customers: 12000 },
      { name: "Pro plan", customers: 3400, mrr: 98000.5 },
    ]);
    expect(() => parseSegments("Pro")).toThrow(/Cannot read segment/);
  });
});

describe("pipeline with customer data and segments", () => {
  const tickets = () => {
    const d = tmp();
    const f = path.join(d, "tickets.csv");
    writeFileSync(
      f,
      [
        "body,plan",
        "We would downgrade the moment the Pro price goes up again,Pro",
        "Our whole team relies on the shared dashboards every single day,Team",
        "I only use the free plan for side projects and would not pay,Free",
        "The Pro plan already feels pricey compared with what we get,Pro",
      ].join("\n"),
    );
    return f;
  };

  it("anchors shares to segments and reports customers and revenue at risk", async () => {
    const llm = new MockProvider();
    const res = await runRehearsal({
      seed: {
        change: "Raise Pro from $49 to $79 per month",
        kind: "pricing",
        segments: [
          { name: "Free", customers: 6000, mrr: 0 },
          { name: "Pro", customers: 3000, mrr: 90000 },
          { name: "Team", customers: 1000, mrr: 100000 },
        ],
      },
      customerPaths: [tickets()],
      llmProvider: llm,
      groundProvider: new MockGround(),
      outDir: tmp(),
      personas: 4,
      rounds: 1,
      samples: 1,
      maxPages: 3,
    });
    const r = res.report;
    expect(() => ReportSchema.parse(r)).not.toThrow();
    expect(r.basis.weighting).toBe("segments");
    expect(r.basis.customerQuotes).toBe(4);
    expect(r.evidence.slice(0, 4).every((e) => e.source === "customer")).toBe(true);
    // Mock: Pat 1 Free, Pat 2 Pro (churns in round 1), Pat 3 Team, Pat 4 Free.
    expect(r.personas.map((x) => x.customerSegment)).toEqual(["Free", "Pro", "Team", "Free"]);
    expect(r.personas.find((x) => x.customerSegment === "Pro")!.weight).toBeCloseTo(0.3, 3);
    expect(r.stats.atRisk).toMatchObject({ customers: 3000, mrr: 90000 });
    expect(r.headline).toContain("3,000 customers and $90,000 of monthly revenue at risk");
    const personaPrompt = llm.prompts.find((x) => x.includes("Build exactly"))!;
    expect(personaPrompt).toContain("(your customer, Pro)");
    expect(personaPrompt).toContain('- "Pro": 3000 customers, 90000 USD MRR');
    expect(readFileSync(res.files.html, "utf8")).toContain("By customer segment");
    expect(readFileSync(res.files.markdown, "utf8")).toContain("| Pro | 3,000 (30%) |");
  });

  it("lowers confidence when a large segment has no persona", async () => {
    const llm = new MockProvider();
    llm.skipSegments = ["Free"];
    const res = await runRehearsal({
      seed: { change: "Raise Pro from $49 to $79 per month", segments: [{ name: "Free", customers: 6000 }, { name: "Pro", customers: 3000 }, { name: "Team", customers: 1000 }] },
      customerPaths: [tickets()],
      llmProvider: llm,
      groundProvider: new MockGround(),
      outDir: tmp(),
      personas: 4,
      rounds: 1,
      samples: 1,
      maxPages: 3,
    });
    expect(res.report.stats.atRisk?.uncoveredCustomers).toBe(6000);
    expect(res.report.basis.confidenceReason).toContain("had no persona");
  });

  it("refuses more segments than personas", async () => {
    await expect(
      runRehearsal({
        seed: { change: "Raise Pro from $49 to $79 per month", segments: [1, 2, 3, 4].map((i) => ({ name: `S${i}`, customers: 10 })) },
        llmProvider: new MockProvider(),
        groundProvider: new MockGround(),
        outDir: tmp(),
        personas: 3,
      }),
    ).rejects.toThrow(/at least as many personas/);
  });
});

describe("net revenue after a price change", () => {
  const personas = [p("a", 0.6, "Free"), p("c", 0.3, "Starter"), p("d", 0.1, "Pro")];
  const segs = [
    { name: "Free", customers: 9000 },
    { name: "Starter", customers: 2400, mrr: 36000, mrrAfter: 60000 },
    { name: "Pro", customers: 600, mrr: 24000 },
  ];

  it("charges stayers the new price, keeps unchanged segments at today's price, and finds break-even", () => {
    const last = [react("a", -1, "stay"), { ...react("c", -2, "churn") }, react("d", 0, "stay")];
    // Starter fully churns in this toy case; use a split instead for a realistic check.
    const split = [p("a", 0.6, "Free"), p("c1", 0.12, "Starter"), p("c2", 0.18, "Starter"), p("d", 0.1, "Pro")];
    const rows = segmentResults(split, [react("a", -1, "stay"), react("c1", -2, "churn"), react("c2", -1, "stay"), react("d", 0, "stay")], segs);
    const starter = rows[1]!;
    expect(starter.leaveShare).toBe(0.4);
    expect(starter.mrrAfter).toBe(60000);
    expect(starter.breakEvenLeaveShare).toBe(0.4);
    // 60% stay at 60,000 = 36,000, today 36,000: flat at exactly break-even.
    expect(starter.netMrrChange).toBe(0);
    expect(rows[2]).toMatchObject({ mrrAfter: 24000, netMrrChange: 0, breakEvenLeaveShare: null });
    expect(rows[0]).toMatchObject({ mrrAfter: 0, netMrrChange: 0 });
    expect(atRiskFrom(segmentResults(personas, last, segs), segs, "USD").netMrrChange).toBe(-36000);
  });

  it("ranges net revenue across samples and signs it in the headline", () => {
    const s1 = computeStats([p("a", 0.6, "Free"), p("c", 0.3, "Starter"), p("d", 0.1, "Pro")], [react("a", 0, "stay"), react("c", -1, "stay"), react("d", 0, "stay")], 1, segs);
    const s2 = computeStats([p("a", 0.6, "Free"), p("c1", 0.15, "Starter"), p("c2", 0.15, "Starter"), p("d", 0.1, "Pro")], [react("a", 0, "stay"), react("c1", -2, "churn"), react("c2", -1, "stay"), react("d", 0, "stay")], 1, segs);
    expect(s1.atRisk?.netMrrChange).toBe(24000);
    expect(s2.atRisk?.netMrrChange).toBe(-6000);
    const e = buildEnsemble([s1, s2]);
    expect(e.netMrrChange).toEqual({ median: 9000, min: -6000, max: 24000 });
    expect(atRiskLine(e, "USD")).toContain("Net monthly revenue after the change: +$9,000 (-$6,000 to +$24,000).");
  });

  it("has no net figure when no segment has a new price", () => {
    const rows = segmentResults(personas, [react("a", 0, "stay"), react("c", 0, "stay"), react("d", 0, "stay")], segments);
    expect(rows.every((r) => r.netMrrChange === null && r.mrrAfter === null)).toBe(true);
  });

  it("parses the new price and rejects it without today's revenue", () => {
    expect(parseSegments("Starter=2400:36000:60000")).toEqual([{ name: "Starter", customers: 2400, mrr: 36000, mrrAfter: 60000 }]);
    expect(() => parseSeed({ change: "Raise Starter to $25", segments: [{ name: "S", customers: 1, mrrAfter: 10 }] })).toThrow(/mrrAfter needs mrr/);
  });
});

describe("customer data checks before a run starts", () => {
  it("fails on a wrong column without creating a run folder", async () => {
    const out = tmp();
    const d = tmp();
    writeFileSync(path.join(d, "t.csv"), "body,plan\nThe price is already high for what we get,Pro\n");
    await expect(
      runRehearsal({ seed: { change: "Raise Pro from $49 to $79 per month" }, customerPaths: [d], customerColumns: { text: "nope" }, llmProvider: new MockProvider(), groundProvider: new MockGround(), outDir: out }),
    ).rejects.toThrow(/not in the customer data/);
    expect(readdirSync(out)).toEqual([]);
  });
});

describe("at-risk wording", () => {
  it("says nobody leaves instead of zero customers at risk", () => {
    const s = computeStats([p("a", 1, "Pro")], [react("a", -1, "stay")], 1, [{ name: "Pro", customers: 600, mrr: 24000, mrrAfter: 30000 }]);
    expect(atRiskLine(buildEnsemble([s]), "USD")).toBe("No customers would leave. Net monthly revenue after the change: +$6,000.");
  });
});
