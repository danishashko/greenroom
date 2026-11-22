import { describe, expect, it } from "vitest";
import { extractJson } from "../src/llm/base.js";
import { buildClaudeArgs } from "../src/llm/claude-cli.js";
import { coreQueries, dateAbove, datesIn, diversify, isAfterCutoff, mergeQueries, quoteIsVerbatim, redditPostLatestDate } from "../src/pipeline/ground.js";
import { weightPersonas } from "../src/pipeline/personas.js";
import { buildEnsemble, buildHeadline, buildThemes, computeStats, gradeConfidence } from "../src/pipeline/report.js";
import { estimateRun } from "../src/pipeline/estimate.js";
import { jsonSchemaOf, SeedSchema } from "../src/schema.js";
import { redactPersonalData } from "../src/util.js";
import type { Persona, Reaction } from "../src/schema.js";

const persona = (id: string, weight: number, evidenceIds: string[] = ["e1"]): Persona => ({
  id,
  name: id,
  role: "r",
  segment: "s",
  summary: "x",
  goals: [],
  objections: [],
  priceSensitivity: "medium",
  currentSolution: "x",
  evidenceIds,
  weight,
});
const reaction = (personaId: string, round: number, stance: number, action: Reaction["action"], objections: string[] = []): Reaction => ({
  personaId,
  round,
  stance,
  action,
  objections,
  reasoning: "because reasons here",
  evidenceIds: [],
});

describe("extractJson", () => {
  it("handles fences, prose and nested braces in strings", () => {
    expect(extractJson('Sure!\n```json\n{"a":{"b":"}"}}\n```')).toEqual({ a: { b: "}" } });
    expect(extractJson('noise {"x":1} trailing')).toEqual({ x: 1 });
  });
  it("throws without JSON", () => {
    expect(() => extractJson("nothing here")).toThrow();
  });
});

describe("quoteIsVerbatim", () => {
  const page = "He said: “We’d leave   if the price doubles.” Then went quiet.";
  it("accepts quotes that differ only in quote marks and spacing", () => {
    expect(quoteIsVerbatim("We'd leave if the price doubles.", page)).toBe(true);
  });
  it("rejects reworded or invented quotes", () => {
    expect(quoteIsVerbatim("We would leave if the price doubled.", page)).toBe(false);
    expect(quoteIsVerbatim("short", page)).toBe(false);
  });
});

describe("date shown above a quote", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  it("reads forum, article and ISO dates and ignores future ones", () => {
    expect(datesIn("* Jul 17 2026 6 posts * Jul 8 2026 2 posts", now).map((d) => d.iso)).toEqual(["2026-07-17", "2026-07-08"]);
    expect(datesIn("Posted 3 Jun 2025, renews Jan 1, 2027", now).map((d) => d.iso)).toEqual(["2025-06-03"]);
    expect(datesIn("no dates, (c) 2026", now)).toEqual([]);
  });
  it("takes the nearest date above the quote, not a newer one elsewhere on the page", () => {
    const page = ["r/squarespace • 2y ago", "Is it too expensive? The price went from 120 to 170 a year.", "• [3mo ago](https://x) a newer comment", "Related: • 2mo ago"].join(" ");
    expect(dateAbove(page, "The price went from 120 to 170 a year.", now)).toBe("2024-11-18");
    expect(dateAbove(page, "a newer comment", now)).toBe("2026-08-18");
    expect(dateAbove("Published July 3, 2024. I love this tool for my portfolio.", "I love this tool for my portfolio.", now)).toBe("2024-07-03");
    expect(dateAbove("I love this tool for my portfolio. July 3, 2024", "I love this tool for my portfolio.", now)).toBeUndefined();
  });
});

describe("reddit post age", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  it("turns the age a thread shows into the latest date it could have been posted", () => {
    expect(redditPostLatestDate("r/squarespace • 2y ago\nIs Squarespace now too expensive?", now)).toBe("2024-11-18");
    expect(redditPostLatestDate("u/someone • 4mo ago", now)).toBe("2026-07-18");
    expect(redditPostLatestDate("no age here", now)).toBeUndefined();
  });

  it("keeps a thread older than the cut-off and drops one that may be newer", () => {
    expect(isAfterCutoff(redditPostLatestDate("• 5mo ago", now), "2026-07-16")).toBe(false);
    expect(isAfterCutoff(redditPostLatestDate("• 4mo ago", now), "2026-07-16")).toBe(true);
  });
});

describe("search queries", () => {
  it("runs the same core queries for every pricing rehearsal of a named product", () => {
    const seed = SeedSchema.parse({ change: "Raise Pro from $49 to $79 per month", kind: "pricing", productName: "Acme" });
    expect(coreQueries(seed)).toEqual(["Acme price increase", "Acme too expensive reddit", "Acme alternatives cheaper", "Acme worth it reddit"]);
    expect(coreQueries(SeedSchema.parse({ change: "Raise Pro from $49 to $79 per month" }))).toEqual([]);
  });

  it("puts core queries first, drops repeats and caps the total", () => {
    expect(mergeQueries(["Acme price increase", "Acme reddit"], ["acme  Price increase", "Acme vs Beta", "Acme churn", "Acme refund"], 4)).toEqual([
      "Acme price increase",
      "Acme reddit",
      "Acme vs Beta",
      "Acme churn",
    ]);
  });
});

describe("diversify", () => {
  it("round-robins across domains", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => ({ domain: "a.com", n: i })),
      { domain: "b.com", n: 0 },
      { domain: "c.com", n: 0 },
    ];
    const out = diversify(items, 4).map((x) => x.domain);
    expect(out).toEqual(["a.com", "b.com", "c.com", "a.com"]);
  });
});

describe("redactPersonalData", () => {
  it("removes emails and phone numbers", () => {
    expect(redactPersonalData("mail me at jo@example.com or +1 (415) 555-0100")).toBe("mail me at [email] or [phone]");
  });
});

describe("weights and stats", () => {
  it("weights personas by evidence and sums to 1", () => {
    const w = weightPersonas([{ evidenceIds: ["a", "b", "c"] }, { evidenceIds: ["a"] }]);
    expect(w[0]!.weight).toBeGreaterThan(w[1]!.weight);
    expect(w.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 3);
  });

  it("computes weighted shares in code", () => {
    const ps = [persona("p1", 0.5), persona("p2", 0.3), persona("p3", 0.2)];
    const rs = [
      reaction("p1", 1, -1, "downgrade"),
      reaction("p2", 1, 1, "stay"),
      reaction("p3", 1, 0, "delay"),
      reaction("p1", 2, -2, "churn"),
      reaction("p2", 2, 1, "stay"),
      reaction("p3", 2, 0, "delay"),
    ];
    const s = computeStats(ps, rs, 2);
    expect(s.negativeShare).toBe(0.5);
    expect(s.positiveShare).toBe(0.3);
    expect(s.neutralShare).toBe(0.2);
    expect(s.leaveShare).toBe(0.5);
    expect(s.movedMindShare).toBe(0.5);
    expect(s.meanStance).toBeCloseTo(-0.7, 1);
    expect(buildHeadline(buildEnsemble([s]), "Price too steep")).toBe("50% of the audience would leave or switch. Main objection: price too steep. 50% react negatively.");
  });
});

describe("confidence", () => {
  it("grades by quotes and domains", () => {
    expect(gradeConfidence(0, 0, false).level).toBe("low");
    expect(gradeConfidence(8, 2, true).level).toBe("low");
    expect(gradeConfidence(20, 4, true).level).toBe("medium");
    expect(gradeConfidence(40, 6, true).level).toBe("high");
  });
});

describe("themes", () => {
  it("attaches weight and real quotes, and ignores bad indexes", () => {
    const ps = [persona("p1", 0.6, ["e1"]), persona("p2", 0.4, ["e2"])];
    const items = [
      { personaId: "p1", text: "price" },
      { personaId: "p2", text: "cost" },
    ];
    const ev = [
      { id: "e1", source: "reddit" as const, url: "https://r/1", domain: "reddit.com", quote: "too pricey", via: "x" },
      { id: "e2", source: "review" as const, url: "https://g2/1", domain: "g2.com", quote: "costly", via: "x" },
    ];
    const t = buildThemes([{ label: "Price", objectionNumbers: [0, 1, 99], evidenceIds: ["e2", "e1", "e9"] }], items, ps, [], ev);
    expect(t).toHaveLength(1);
    expect(t[0]!.weight).toBe(1);
    expect(t[0]!.quotes.map((q) => q.evidenceId)).toEqual(["e2", "e1"]);
  });

  it("shows no quote rather than one that does not match the objection", () => {
    const ps = [persona("p1", 1, ["e1"])];
    const ev = [{ id: "e1", source: "reddit" as const, url: "https://r/1", domain: "reddit.com", quote: "great templates", via: "x" }];
    const t = buildThemes([{ label: "Price", objectionNumbers: [0] }], [{ personaId: "p1", text: "price" }], ps, [], ev);
    expect(t[0]!.quotes).toEqual([]);
  });
});

describe("claude-cli isolation", () => {
  const args = buildClaudeArgs({ schemaJson: { type: "object" }, system: "sys", model: "sonnet" });
  it("never uses --bare, which would disable subscription login", () => {
    expect(args).not.toContain("--bare");
  });
  it("blocks tools, MCP servers, skills and settings so calls stay small", () => {
    expect(args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]));
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args[args.indexOf("--output-format") + 1]).toBe("json");
  });
  it("passes the schema as JSON", () => {
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1]!)).toEqual({ type: "object" });
  });
});

describe("schemas and estimate", () => {
  it("exports JSON Schema without $schema", () => {
    const js = jsonSchemaOf(SeedSchema);
    expect(js["$schema"]).toBeUndefined();
    expect(js["type"]).toBe("object");
  });
  it("estimates calls from personas x rounds", () => {
    const e = estimateRun({ personas: 8, rounds: 3, maxQueries: 6, maxPages: 12, urls: 0, searchEnabled: true, llm: { id: "claude-cli", kind: "subscription", concurrency: 3, models: { fast: "a", strong: "b" } } });
    expect(e.calls.breakdown["simulate"]).toBe(24);
    expect(e.calls.total).toBeGreaterThan(38);
    expect(e.cost.usd).toBeNull();
  });
});

describe("local grounding text", () => {
  it("decodes entities and flattens JSON comment trees", async () => {
    const { htmlToText, jsonToText } = await import("../src/ground/local.js");
    expect(htmlToText("<p>It&#x27;s &amp; it&#39;s fine</p>")).toBe("It's & it's fine");
    const tree = { children: [{ text: "<p>I can&#x27;t afford the new plan at this size.</p>", children: [] }] };
    expect(jsonToText(tree)).toBe("I can't afford the new plan at this size.");
  });
});

describe("page focusing", () => {
  it("strips link targets and keeps on-topic first-person paragraphs under the cap", async () => {
    const { cleanMarkdown, focusText } = await import("../src/ground/clean.js");
    expect(cleanMarkdown("See [the thread](https://x.com/a_(b)) ![](logo.svg) now")).toBe("See the thread now");
    const nav = Array.from({ length: 40 }, (_, i) => `Home | About | Login | Menu item number ${i} goes here for the site nav`).join("\n\n");
    const gold = "We pay for Acme every month and if the price goes to $79 we will switch to another tool.";
    const out = focusText(`${nav}\n\n${gold}\n\n${nav}`, ["acme"], 400);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out).toContain(gold);
  });
});

describe("redaction keeps dates and prices", () => {
  it("only removes phone-length numbers", () => {
    expect(redactPersonalData("Ends 2022-11-28, was $1,200,000 a year, call 415 555 0100 now")).toBe("Ends 2022-11-28, was $1,200,000 a year, call [phone] now");
  });
});

describe("transient errors", () => {
  it("classifies retryable failures", async () => {
    const { isTransient } = await import("../src/llm/base.js");
    expect(isTransient(new Error("claude timed out after 240s."))).toBe(true);
    expect(isTransient(new Error("openai returned HTTP 529: overloaded"))).toBe(true);
    expect(isTransient(new Error("`claude` was not found on PATH."))).toBe(false);
    expect(isTransient(new Error("anthropic returned HTTP 401: invalid api key"))).toBe(false);
  });
  it("retries a timed-out call and then succeeds", async () => {
    const { MockProvider } = await import("./helpers.js");
    const { z } = await import("zod");
    const p = new MockProvider();
    p.transientFailures = 2;
    const r = await p.complete({ system: "s", prompt: "p", schema: z.object({ queries: z.array(z.string()) }), label: "t", tier: "fast" });
    expect(r.data.queries.length).toBeGreaterThan(0);
  });
});

describe("digest", () => {
  it("always shows the strongest voice on each side", async () => {
    const { digestFrom } = await import("../src/prompts.js");
    const ps = ["a", "b", "c", "d", "e", "f", "g"].map((id) => persona(id, 1 / 7));
    const rs = ps.map((p, i) => ({ ...reaction(p.id, 1, i === 6 ? 2 : i === 3 ? -2 : 0, "stay"), reasoning: `voice ${p.id}` }));
    for (const rot of [0, 1, 4]) {
      const d = digestFrom(rs, ps, rot, 3);
      expect(d).toContain("voice d");
      expect(d).toContain("voice g");
    }
  });
});

describe("html report links", () => {
  it("never links non-http URLs", async () => {
    const { renderHtml } = await import("../src/render/html.js");
    const { MockProvider, MockGround } = await import("./helpers.js");
    const { runRehearsal } = await import("../src/engine.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const res = await runRehearsal({ seed: { change: "Raise Pro from $49 to $79 per month" }, llmProvider: new MockProvider(), groundProvider: new MockGround(), outDir: mkdtempSync(path.join(tmpdir(), "gr-html-")), personas: 3, rounds: 1, maxPages: 3 });
    const r = res.report;
    r.evidence[0]!.url = "javascript:alert(1)";
    r.themes[0]!.quotes[0]!.url = "javascript:alert(1)";
    const html = renderHtml(r);
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it("includes the 3D room with parseable script", async () => {
    const { renderHtml } = await import("../src/render/html.js");
    const { ROOM_JS } = await import("../src/render/room.js");
    const { MockProvider, MockGround } = await import("./helpers.js");
    const { runRehearsal } = await import("../src/engine.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const res = await runRehearsal({ seed: { change: "Raise Pro from $49 to $79 per month" }, llmProvider: new MockProvider(), groundProvider: new MockGround(), outDir: mkdtempSync(path.join(tmpdir(), "gr-room-")), personas: 3, rounds: 2, maxPages: 3 });
    const html = renderHtml(res.report);
    expect(html).toContain('<canvas id="room"');
    expect(html).toContain('data-round="2"');
    expect(() => new Function(ROOM_JS)).not.toThrow();
  });
});

describe("search result filtering", () => {
  it("drops redirect wrappers and video pages, backfills from the rest", async () => {
    const { runRehearsal } = await import("../src/engine.js");
    const { MockProvider, MockGround } = await import("./helpers.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const ground = new MockGround();
    const fetched: string[] = [];
    ground.search = async () =>
      ["https://www.google.com/goto?url=abc", "https://www.youtube.com/watch?v=1", "https://reddit.com/r/a/1", "https://news.ycombinator.com/item?id=2", "https://g2.com/x", "https://bad.example.com/fail"].map((url) => ({ url, title: "", snippet: "" }));
    const orig = ground.fetchPage.bind(ground);
    ground.fetchPage = async (url: string) => {
      fetched.push(url);
      if (url.includes("bad.example")) throw new Error("boom");
      return orig(url);
    };
    const res = await runRehearsal({ seed: { change: "Raise Pro from $49 to $79 per month" }, llmProvider: new MockProvider(), groundProvider: ground, outDir: mkdtempSync(path.join(tmpdir(), "gr-f-")), personas: 3, rounds: 1, maxPages: 2 });
    expect(fetched.some((u) => /google|youtube/.test(u))).toBe(false);
    expect(new Set(res.report.evidence.map((e) => e.domain)).size).toBe(2);
  });

  it("reports unreadable pages as one summary line, with the URLs in data and warnings", async () => {
    const { runRehearsal } = await import("../src/engine.js");
    const { MockProvider, MockGround } = await import("./helpers.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const ground = new MockGround();
    ground.search = async () => ["https://reddit.com/r/a/1", "https://news.ycombinator.com/item?id=2", "https://bad.example.com/a", "https://bad.example.com/b"].map((url) => ({ url, title: "", snippet: "" }));
    const orig = ground.fetchPage.bind(ground);
    ground.fetchPage = async (url: string) => {
      if (url.includes("bad.example")) throw new Error("The operation was aborted due to timeout");
      return orig(url);
    };
    const events: { level: string; message: string; data?: Record<string, unknown> }[] = [];
    const res = await runRehearsal({ seed: { change: "Raise Pro from $49 to $79 per month" }, llmProvider: new MockProvider(), groundProvider: ground, outDir: mkdtempSync(path.join(tmpdir(), "gr-s-")), personas: 3, rounds: 1, maxPages: 2, onEvent: (e) => events.push(e) });
    expect(events.filter((e) => e.level === "warn" && e.message.includes("Could not read"))).toHaveLength(0);
    const summary = events.find((e) => /^Read \d+ of \d+ pages \(\d+ could not be read\)$/.test(e.message));
    expect(summary?.level).toBe("info");
    const skipped = summary?.data?.["skipped"] as string[];
    expect(skipped.length).toBeGreaterThan(0);
    expect(summary?.message).toContain(`(${skipped.length} could not be read)`);
    expect(res.warnings.filter((w) => w.startsWith("Could not read"))).toEqual(skipped);
  });
});

describe("ensemble", () => {
  const st = (leave: number, neg: number) => ({ personas: 4, rounds: 2, negativeShare: neg, neutralShare: 1 - neg, positiveShare: 0, meanStance: -1, leaveShare: leave, actions: {}, movedMindShare: 0 });
  it("reports median and range and shows the sample nearest the median", () => {
    const e = buildEnsemble([st(0.29, 0.89), st(0.55, 0.83), st(0.4, 0.86)]);
    expect(e.leaveShare).toEqual({ median: 0.4, min: 0.29, max: 0.55 });
    expect(e.shownSample).toBe(2);
    expect(buildHeadline(e)).toBe("40% (29 to 55%) of the audience would leave or switch. 86% (83 to 89%) react negatively.");
  });
  it("downgrades confidence when samples disagree, and says so", () => {
    const wide = buildEnsemble([st(0.29, 0.89), st(0.55, 0.83), st(0.4, 0.86)]);
    const tight = buildEnsemble([st(0.4, 0.86), st(0.42, 0.85), st(0.38, 0.87)]);
    expect(gradeConfidence(40, 6, true, wide)).toMatchObject({ level: "medium" });
    expect(gradeConfidence(40, 6, true, wide).reason).toContain("Samples disagree");
    expect(gradeConfidence(40, 6, true, tight).level).toBe("high");
    expect(gradeConfidence(40, 6, true, buildEnsemble([st(0.4, 0.86)])).reason).toContain("Single sample");
  });
  it("runs every sample and stores each one", async () => {
    const { runRehearsal } = await import("../src/engine.js");
    const { MockProvider, MockGround } = await import("./helpers.js");
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const llm = new MockProvider();
    const res = await runRehearsal({ seed: { change: "Raise Pro from $49 to $79 per month" }, llmProvider: llm, groundProvider: new MockGround(), outDir: mkdtempSync(path.join(tmpdir(), "gr-e-")), personas: 3, rounds: 2, samples: 3, maxPages: 3 });
    expect(res.report.ensemble.samples).toBe(3);
    expect(res.report.ensemble.perSample).toHaveLength(3);
    expect(llm.prompts.filter((p) => p.includes("Round 1 of 2"))).toHaveLength(9);
    for (const s of [0, 1, 2]) expect(existsSync(path.join(res.dir, `reactions.s${s}.json`))).toBe(true);
  });
});

describe("backtest cut-off", () => {
  it("parses the dates Google shows next to results", async () => {
    const { parseResultDate } = await import("../src/ground/brightdata.js");
    const now = new Date("2026-11-13T00:00:00Z");
    expect(parseResultDate("https://devtoollab.com · Aug 29, 2026", now)).toBe("2026-08-29");
    expect(parseResultDate("30+ comments · 3 years ago", now)).toBe("2023-11-13");
    expect(parseResultDate("a month ago", now)).toBe("2026-10-13");
    expect(parseResultDate("https://news.ycombinator.com › item", now)).toBeUndefined();
  });
  it("keeps unknown dates and drops later ones", async () => {
    const { isAfterCutoff } = await import("../src/pipeline/ground.js");
    expect(isAfterCutoff("2022-09-01", "2022-08-24")).toBe(true);
    expect(isAfterCutoff("2022-08-24", "2022-08-24")).toBe(false);
    expect(isAfterCutoff(undefined, "2022-08-24")).toBe(false);
    expect(isAfterCutoff("last week", "2022-08-24")).toBe(false);
    expect(isAfterCutoff("2030-01-01", undefined)).toBe(false);
  });
  it("drops undated review-site quotes only in a backtest", async () => {
    const { undatedReviewInBacktest } = await import("../src/pipeline/ground.js");
    expect(undatedReviewInBacktest("review", undefined, "2023-09-11")).toBe(true);
    expect(undatedReviewInBacktest("review", "2023-01-05", "2023-09-11")).toBe(false);
    expect(undatedReviewInBacktest("hackernews", undefined, "2023-09-11")).toBe(false);
    expect(undatedReviewInBacktest("review", undefined, undefined)).toBe(false);
  });
  it("leaves Google redirect links unresolved only when they cannot be followed", async () => {
    const { resolveGoogleRedirect } = await import("../src/ground/brightdata.js");
    expect(await resolveGoogleRedirect("https://reddit.com/r/a/1")).toBe("https://reddit.com/r/a/1");
  });
  it("passes the cut-off to search, drops later quotes and tells personas the date", async () => {
    const { runRehearsal } = await import("../src/engine.js");
    const { MockProvider, MockGround } = await import("./helpers.js");
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const ground = new MockGround();
    const seen: (string | undefined)[] = [];
    const origSearch = ground.search.bind(ground);
    ground.search = async (q: string, o?: { before?: string }) => {
      seen.push(o?.before);
      const hits = await origSearch();
      return [...hits, { url: "https://later.example.com/t", title: "", snippet: "", date: "2023-01-01" }];
    };
    const dir = mkdtempSync(path.join(tmpdir(), "gr-asof-"));
    const file = path.join(dir, "q.json");
    writeFileSync(file, JSON.stringify([{ quote: "Posted long after the change, this should not count.", date: "2023-05-01" }, { quote: "Written before anything changed, this one stays in.", date: "2022-01-01" }]));
    const llm = new MockProvider();
    const res = await runRehearsal({ seed: { change: "End the free plan on November 28", asOf: "2022-08-24" }, llmProvider: llm, groundProvider: ground, evidencePaths: [file], outDir: dir, personas: 3, rounds: 1, samples: 1, maxPages: 3 });
    expect(seen.every((b) => b === "2022-08-24")).toBe(true);
    expect(res.report.evidence.some((e) => e.quote.startsWith("Posted long after"))).toBe(false);
    expect(res.report.evidence.some((e) => e.quote.startsWith("Written before"))).toBe(true);
    expect(res.report.basis.asOf).toBe("2022-08-24");
    expect(res.report.basis.droppedAfterCutoff).toBe(5); // 3 later search hits (one per query) + 1 later quote + 1 undated review-site quote
    expect(res.report.evidence.some((e) => e.source === "review" && !e.date)).toBe(false);
    expect(res.report.basis.confidenceReason).toContain("may already know the outcome");
    expect(llm.prompts.some((p) => p.includes("Today is 2022-08-24"))).toBe(true);
  });
  it("rejects a malformed cut-off", async () => {
    const { parseSeed } = await import("../src/engine.js");
    expect(() => parseSeed({ change: "End the free plan on November 28", asOf: "24/08/2022" })).toThrow(/YYYY-MM-DD/);
    expect(() => parseSeed({ change: "End the free plan on November 28", asOf: "2022-02-29" })).toThrow(/not a real date/);
    expect(parseSeed({ change: "End the free plan on November 28", asOf: "2024-02-29" }).asOf).toBe("2024-02-29");
  });
  it("refuses run ids that are paths", async () => {
    const { RunStore } = await import("../src/store.js");
    for (const id of ["../..", "..", "a/b", "a\\b", ".hidden"]) expect(() => RunStore.open(".", id)).toThrow(/No run/);
  });
});

describe("cli crash", () => {
  it("treats a crashed CLI process as retryable", async () => {
    const { isTransient } = await import("../src/llm/base.js");
    expect(isTransient(new Error("claude crashed (exit code 3221226505) without output."))).toBe(true);
  });
});

describe("agent guide", () => {
  it("is what the MCP server sends and names every tool and error code", async () => {
    const { AGENT_GUIDE } = await import("../src/guide.js");
    for (const t of ["greenroom_doctor", "greenroom_estimate", "greenroom_start", "greenroom_status", "greenroom_report", "greenroom_runs"]) expect(AGENT_GUIDE).toContain(t);
    const { EXIT_CODES } = await import("../src/errors.js");
    for (const code of Object.keys(EXIT_CODES).filter((c) => c !== "INTERNAL")) expect(AGENT_GUIDE).toContain(code);
    const mcp = (await import("node:fs")).readFileSync("src/mcp.ts", "utf8");
    expect(mcp).toContain("instructions: AGENT_GUIDE");
  });
});

describe("anthropic structured outputs schema", () => {
  it("drops unsupported limits and closes every object", async () => {
    const { toStructuredSchema } = await import("../src/llm/anthropic.js");
    const { z } = await import("zod");
    const s = toStructuredSchema(jsonSchemaOf(z.object({ a: z.string().min(3).max(9), b: z.array(z.object({ n: z.number().int().min(-2).max(2) })).max(8), c: z.enum(["x", "y"]) }))) as Record<string, any>;
    const text = JSON.stringify(s);
    for (const k of ["minLength", "maxLength", "minimum", "maximum", "maxItems"]) expect(text).not.toContain(`"${k}"`);
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.b.items.additionalProperties).toBe(false);
    expect(s.properties.c.enum).toEqual(["x", "y"]);
    expect(s.required).toEqual(["a", "b", "c"]);
  });
});

describe("bright data timeouts", () => {
  const timeoutError = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  it("retries a page once after a timeout", async () => {
    const { BrightDataProvider } = await import("../src/ground/brightdata.js");
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) throw timeoutError();
      return new Response("# Thread\nA comment.", { status: 200 });
    }) as typeof fetch;
    try {
      const page = await new BrightDataProvider("k").fetchPage("https://www.reddit.com/r/a/comments/1/x/");
      expect(page.markdown).toContain("A comment.");
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = orig;
    }
  });
  it("gives up after a second timeout", async () => {
    const { BrightDataProvider } = await import("../src/ground/brightdata.js");
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw timeoutError();
    }) as typeof fetch;
    try {
      await expect(new BrightDataProvider("k").fetchPage("https://www.reddit.com/r/a/comments/1/x/")).rejects.toThrow(/after 2 attempts \(timed out/);
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("quote dates and tone", () => {
  it("flags a quote pool that leans one way", async () => {
    const { quoteMix, quoteMixNote } = await import("../src/pipeline/report.js");
    const ev = (tone?: "negative" | "neutral" | "positive") => ({ id: "e", source: "reddit" as const, url: "u", domain: "d", quote: "q", via: "x", tone });
    const lean = quoteMix([...Array(9)].map(() => ev("negative")).concat([ev("positive"), ev()]));
    expect(lean).toEqual({ negative: 9, neutral: 0, positive: 1, untagged: 1 });
    expect(quoteMixNote(lean)).toContain("9 of 10 quotes are complaints");
    expect(quoteMixNote(quoteMix([ev("negative"), ev("negative"), ev("positive"), ev("neutral"), ev("positive"), ev("neutral")]))).toBe("");
  });
});
