import type { GroundProvider, Page, SearchHit } from "./types.js";

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Flatten a JSON API response (comment trees, review feeds) to the readable text of its string values. */
export function jsonToText(value: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      if (v.length > 30 && /\s/.test(v)) out.push(htmlToText(v));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(value);
  return out.join("\n\n");
}

/** Plain fetch. No search, no unblocking. Works for friendly pages the user points at. */
export class LocalProvider implements GroundProvider {
  id = "local";
  label = "Plain HTTP fetch (no search, no unblocking)";
  canSearch = false;

  async check() {
    return { ok: true, detail: "Always available. Pages that block bots will fail; use Bright Data for those." };
  }

  async search(): Promise<SearchHit[]> {
    return [];
  }

  async fetchPage(url: string): Promise<Page> {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; greenroom/0.1)", accept: "text/html,text/plain" },
      signal: AbortSignal.timeout(30_000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const body = await res.text();
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("json")) {
      try {
        return { url, markdown: jsonToText(JSON.parse(body)) };
      } catch {
        /* not valid JSON, fall through */
      }
    }
    return { url, markdown: type.includes("html") ? htmlToText(body) : body };
  }
}
