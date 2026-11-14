import { createHash } from "node:crypto";

/** Map with a concurrency cap. Keeps order. */
export async function pMap<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function shortHash(input: string, len = 6): string {
  return createHash("sha1").update(input).digest("hex").slice(0, len);
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/** Remove emails and phone numbers from text that will be stored or shown. */
export function redactPersonalData(s: string): string {
  return s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?<![\w$€£.,])(?:\+?\d[\d\s().-]{7,}\d)(?![\w%])/g, (m) => {
      // Phone numbers have 9 to 15 digits. Dates (2022-11-28), years and prices stay.
      const digits = m.replace(/\D/g, "").length;
      return digits >= 9 && digits <= 15 ? "[phone]" : m;
    });
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function round(n: number, digits = 3): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
