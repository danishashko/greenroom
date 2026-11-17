import { GreenroomError } from "../errors.js";
import { sleep } from "../util.js";
import type { GroundProvider, Page, SearchHit, SearchOptions } from "./types.js";

/**
 * Google wraps many results (often most Reddit threads) in google.com/goto links. One plain
 * request with redirects off returns the real URL in Location. Returns null if it cannot.
 */
export async function resolveGoogleRedirect(link: string): Promise<string | null> {
  if (!/^https?:\/\/(www\.)?google\.[a-z.]+\/(goto|url)\?/i.test(link)) return link;
  try {
    const res = await fetch(link, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000) });
    const loc = res.headers.get("location");
    if (loc && /^https?:\/\//i.test(loc) && !/^https?:\/\/(www\.)?google\./i.test(loc)) return loc;
    const q = new URL(link).searchParams.get("q") ?? new URL(link).searchParams.get("url");
    return q && /^https?:\/\//i.test(q) ? q : null;
  } catch {
    return null;
  }
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Best-effort publication date from what Google shows next to a result: "Aug 29, 2026",
 * "3 years ago", "5 months ago". Returns YYYY-MM-DD, or undefined. Relative ages are coarse.
 */
export function parseResultDate(text: string | undefined, now = new Date()): string | undefined {
  if (!text) return undefined;
  const abs = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2}), (\d{4})\b/i.exec(text);
  if (abs) {
    const d = new Date(Date.UTC(Number(abs[3]), MONTHS[(abs[1] as string).toLowerCase()] ?? 0, Number(abs[2])));
    return d.toISOString().slice(0, 10);
  }
  const rel = /\b(\d+|a|an) (day|week|month|year)s? ago\b/i.exec(text);
  if (rel) {
    const n = /^\d+$/.test(rel[1] as string) ? Number(rel[1]) : 1;
    const d = new Date(now);
    const unit = (rel[2] as string).toLowerCase();
    if (unit === "day") d.setUTCDate(d.getUTCDate() - n);
    else if (unit === "week") d.setUTCDate(d.getUTCDate() - 7 * n);
    else if (unit === "month") d.setUTCMonth(d.getUTCMonth() - n);
    else d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

/**
 * Bright Data grounding via the REST API (https://api.brightdata.com/request).
 * SERP API finds the conversations, Web Unlocker reads pages that block ordinary
 * requests (Reddit, review sites, Cloudflare-protected forums) and returns markdown.
 *
 * Env: BRIGHTDATA_API_KEY, BRIGHTDATA_SERP_ZONE (default serp_api1),
 *      BRIGHTDATA_UNLOCKER_ZONE (default web_unlocker1).
 */
export class BrightDataProvider implements GroundProvider {
  id = "brightdata";
  label = "Bright Data (SERP API + Web Unlocker)";
  canSearch = true;
  private endpoint = "https://api.brightdata.com/request";

  constructor(
    private apiKey: string,
    private serpZone = process.env["BRIGHTDATA_SERP_ZONE"] ?? "serp_api1",
    private unlockerZone = process.env["BRIGHTDATA_UNLOCKER_ZONE"] ?? "web_unlocker1",
  ) {}

  static fromEnv(): BrightDataProvider | null {
    const key = process.env["BRIGHTDATA_API_KEY"] ?? process.env["BRIGHT_DATA_API_KEY"];
    return key ? new BrightDataProvider(key) : null;
  }

  /**
   * Bright Data reports upstream failures in x-brd-error headers while still answering HTTP 200,
   * often with an empty body (captcha, 502 from the target). Those are transient, so retry them.
   * A "failed_query_rejected" answer means wait at least 15 seconds before the same query.
   */
  private async request(body: Record<string, unknown>): Promise<string> {
    const maxAttempts = 4;
    const timeoutMs = Number(process.env["GREENROOM_HTTP_TIMEOUT_MS"] ?? 60_000);
    let lastError = "";
    let timeouts = 0;
    let made = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      made = attempt;
      let res: Response;
      let text: string;
      try {
        res = await fetch(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        text = await res.text();
      } catch (e) {
        // The same page can take one second or several minutes through the unlocker, so a timed-out
        // request gets one more try. A second timeout ends it, to keep a run from stalling on one page.
        if (!(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))) throw e;
        lastError = `timed out after ${Math.round(timeoutMs / 1000)}s`;
        if (++timeouts >= 2 || attempt === maxAttempts) break;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new GreenroomError("GROUND_FAILED", `Bright Data rejected the request (${res.status}).`, "Check BRIGHTDATA_API_KEY and that the zone names match your dashboard.");
      }
      const brdCode = res.headers.get("x-brd-error-code");
      const brdError = res.headers.get("x-brd-error");
      if (res.ok && !brdCode && text.length > 0) return text;
      lastError = brdCode ? `${brdCode}${brdError ? `: ${brdError.slice(0, 120)}` : ""}` : `HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : " with empty body"}`;
      if (attempt === maxAttempts) break;
      await sleep(brdCode === "failed_query_rejected" ? 16_000 : 2_500 * attempt);
    }
    throw new GreenroomError("GROUND_FAILED", `Bright Data request failed after ${made} ${made === 1 ? "attempt" : "attempts"} (${lastError}).`, "Usually transient. Retry, or check zone names and account balance in the Bright Data dashboard.");
  }

  async check() {
    try {
      const hits = await this.search("test", {});
      return { ok: true, detail: `SERP zone "${this.serpZone}" answered with ${hits.length} results. Unlocker zone "${this.unlockerZone}" not probed.` };
    } catch (e) {
      const err = e instanceof GreenroomError ? e : new GreenroomError("GROUND_FAILED", String(e));
      return { ok: false, detail: err.message, hint: err.hint };
    }
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    const gl = (opts.country ?? "us").toLowerCase();
    let url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=${gl}&brd_json=1`;
    if (opts.before) {
      // Google custom date range: only pages published up to the cut-off.
      const [y, m, d] = opts.before.split("-").map(Number);
      url += `&tbs=${encodeURIComponent(`cdr:1,cd_max:${m}/${d}/${y}`)}`;
    }
    const raw = await this.request({ zone: this.serpZone, url, format: "raw" });
    let json: {
      organic?: { link?: string; title?: string; description?: string; display_link?: string; extensions?: { type?: string; text?: string }[] }[];
    };
    try {
      json = JSON.parse(raw) as typeof json;
    } catch {
      throw new GreenroomError("GROUND_FAILED", "SERP API did not return JSON.", "Make sure the zone is a SERP API zone.");
    }
    const hits = await Promise.all(
      (json.organic ?? [])
        .filter((o) => o.link)
        .map(async (o) => {
          const url = await resolveGoogleRedirect(o.link as string);
          if (!url) return null;
          const shown = [o.display_link, ...(o.extensions ?? []).map((x) => x.text)].filter(Boolean).join(" · ");
          return { url, title: o.title ?? "", snippet: o.description ?? "", date: parseResultDate(shown) };
        }),
    );
    return hits.filter((h): h is NonNullable<typeof h> => h !== null);
  }

  async fetchPage(url: string): Promise<Page> {
    const markdown = await this.request({ zone: this.unlockerZone, url, format: "raw", data_format: "markdown" });
    return { url, markdown };
  }
}
