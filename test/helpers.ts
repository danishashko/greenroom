import { BaseProvider } from "../src/llm/base.js";
import type { ProviderCheck, RawRequest, RawResult } from "../src/llm/types.js";
import type { GroundProvider, Page, SearchHit } from "../src/ground/types.js";

export const HOSTS = ["reddit.com", "news.ycombinator.com", "g2.com", "indiehackers.com", "trustpilot.com"];

export function pageText(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return [
    `Thread on ${host}.`,
    `We pay for this tool every month and a bigger bill would make us look at ${host.split(".")[0]} alternatives right away.`,
    `Honestly the support is the only reason I stay, the features have not changed in a year.`,
    "x".repeat(250),
  ].join("\n");
}

/** Deterministic stand-in for a real LLM. Answers by looking at which schema was requested. */
export class MockProvider extends BaseProvider {
  id = "mock";
  label = "Mock";
  kind = "local" as const;
  concurrency = 4;
  models = { fast: "mock-fast", strong: "mock-strong" };
  prompts: string[] = [];
  failFirstPersonaCall = false;
  /** Throw once, permanently, on this simulation round. */
  failOnRound = 0;
  /** Throw this many transient errors before answering anything. */
  transientFailures = 0;
  /** Segment names no persona will cover, to test uncovered segments. */
  skipSegments: string[] = [];
  protected override retryDelays = [0, 0];
  private failed = false;

  async check(): Promise<ProviderCheck> {
    return { ok: true, detail: "mock" };
  }

  protected async raw(req: RawRequest): Promise<RawResult> {
    if (this.transientFailures > 0) {
      this.transientFailures--;
      throw new Error("claude timed out after 240s.");
    }
    this.prompts.push(req.prompt);
    const props = Object.keys((req.schemaJson["properties"] as Record<string, unknown>) ?? {});
    const usage = { inputTokens: 100, outputTokens: 50 };
    const has = (k: string) => props.includes(k);

    if (has("queries")) return { json: { queries: ["acme pricing reddit", "acme alternatives", "acme review"] }, usage };

    if (has("voices")) {
      const url = /Source URL: (\S+)/.exec(req.prompt)?.[1] ?? "https://example.com";
      const host = new URL(url).hostname.replace(/^www\./, "");
      return {
        json: {
          voices: [
            { quote: `We pay for this tool every month and a bigger bill would make us look at ${host.split(".")[0]} alternatives right away.`, context: "reply" },
            { quote: "This sentence was invented by the model and is not on the page at all.", context: "made up" },
          ],
        },
        usage,
      };
    }

    if (has("personas")) {
      if (this.failFirstPersonaCall && !this.failed) {
        this.failed = true;
        return { json: { personas: "not an array" }, usage };
      }
      const ids = [...req.prompt.matchAll(/\[(e\d+)\]/g)].map((m) => m[1] as string);
      const n = Number(/exactly (\d+) distinct/.exec(req.prompt)?.[1] ?? 4);
      // With seed segments, the prompt lists them; assign personas round robin, skipping any in skipSegments.
      const segs = [...req.prompt.matchAll(/^- "([^"]+)": \d+ customers/gm)].map((m) => m[1] as string).filter((s) => !this.skipSegments.includes(s));
      const personas = Array.from({ length: n }, (_, i) => ({
        name: `Pat ${i + 1}`,
        role: ["Head of Marketing", "Founder", "Ops lead", "Agency owner"][i % 4],
        segment: "Small teams",
        summary: "Runs a lean team. Watches spend.",
        goals: ["ship faster"],
        objections: ["price"],
        priceSensitivity: i % 2 ? "high" : "medium",
        currentSolution: "spreadsheets",
        evidenceIds: ids.length ? [ids[i % ids.length], "e999"] : [],
        ...(segs.length ? { customerSegment: segs[i % segs.length] } : {}),
      }));
      return { json: { personas }, usage };
    }

    if (has("stance")) {
      const round = Number(/Round (\d+) of/.exec(req.prompt)?.[1] ?? 1);
      if (round === this.failOnRound) {
        this.failOnRound = 0;
        throw new Error("permanent failure for test");
      }
      const name = /You are (Pat \d+)/.exec(req.prompt)?.[1] ?? "Pat 1";
      const idx = Number(name.split(" ")[1]);
      const stance = idx % 3 === 0 ? 1 : idx % 3 === 1 ? -1 : -2;
      const finalStance = round > 1 && idx === 2 ? 0 : stance;
      const ev = /\[(e\d+)\]/.exec(req.prompt)?.[1];
      return {
        json: {
          stance: finalStance,
          action: finalStance <= -2 ? "churn" : finalStance < 0 ? "downgrade" : finalStance === 0 ? "delay" : "stay",
          objections: finalStance < 0 ? ["Price rise is too steep", "No new features to justify it"] : [],
          reasoning: `Round ${round} view from ${name}: the price move does not match what the product delivers.`,
          evidenceIds: ev ? [ev, "e404"] : [],
        },
        usage,
      };
    }

    if (has("themes")) {
      const n = (req.prompt.match(/^\d+:/gm) ?? []).length;
      const ids = [...req.prompt.matchAll(/^\[(e\d+)\]/gm)].map((m) => m[1] as string).slice(0, 2);
      return { json: { themes: [{ label: "Price rise too steep", objectionNumbers: Array.from({ length: n }, (_, i) => i), evidenceIds: ids }] }, usage };
    }

    if (has("readout")) {
      return {
        json: {
          readout: "Most buyers push back on the new price and a quarter would leave unless something changes.",
          recommendations: [{ change: "Grandfather current customers for 12 months", why: "Removes the loss framing.", expectedEffect: "Fewer cancellations at renewal.", evidenceIds: ["e1", "e12345"] }],
          riskiest: { personaId: "p2", why: "Most price sensitive." },
        },
        usage,
      };
    }
    throw new Error(`MockProvider: unhandled schema ${props.join(",")}`);
  }
}

export class MockGround implements GroundProvider {
  id = "mock-ground";
  label = "Mock ground";
  canSearch = true;
  async check() {
    return { ok: true, detail: "mock" };
  }
  async search(): Promise<SearchHit[]> {
    return HOSTS.map((h) => ({ url: `https://${h}/thread/1`, title: h, snippet: "" }));
  }
  async fetchPage(url: string): Promise<Page> {
    return { url, markdown: pageText(url) };
  }
}
