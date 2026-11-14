import type { Seed } from "../schema.js";

const STOP = new Set(
  "the and for from with that this will into over than then they them their about after before plan plans month months year years price prices pricing per our your all any are was were has have had not but can its it's".split(" "),
);

/** Strip markdown images, link targets and navigation crumbs. Keeps the words people wrote. */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\((?:[^()\s]|\([^)]*\))*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/^\s*[-*|>#+=_]+\s*$/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Words that make a paragraph relevant to this seed. */
export function seedTerms(seed: Seed): string[] {
  const words = [seed.productName ?? "", ...seed.competitors, seed.change, seed.audience ?? ""]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9.$-]+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  return [...new Set(words)];
}

const OPINION = /\b(i|i'm|i've|we|we're|my|our|us)\b/i;
const MONEY = /(\$|€|£)\s?\d|\b\d+\s?(usd|dollars?|bucks|\/mo|per month|a month)\b|\b(price|pricing|cost|expensive|cheap|afford|pay|paid|free tier|subscription|cancel|switch(ed|ing)?|migrat)/i;

/**
 * Keep the paragraphs most likely to hold a buyer's opinion, in their original order,
 * up to `cap` characters. Navigation and boilerplate lose to first-person, on-topic text.
 * This is the main token saver: unlocked pages are often 100k+ characters.
 */
export function focusText(text: string, terms: string[], cap: number): string {
  if (text.length <= cap) return text;
  const blocks = text.split(/\n{2,}/);
  const paras = (blocks.length >= 8 ? blocks : text.split(/\n/)).map((t, i) => ({ t: t.trim(), i }));
  const scored = paras
    .filter((p) => p.t.length >= 40 && p.t.split(/\s+/).length >= 7)
    .map((p) => {
      const low = p.t.toLowerCase();
      let s = 1;
      for (const term of terms) if (low.includes(term)) s += 3;
      if (OPINION.test(p.t)) s += 2;
      if (MONEY.test(p.t)) s += 2;
      return { ...p, s };
    })
    .sort((a, b) => b.s - a.s || a.i - b.i);

  const keep: typeof scored = [];
  let used = 0;
  for (const p of scored) {
    if (used + p.t.length + 2 > cap) continue;
    keep.push(p);
    used += p.t.length + 2;
  }
  return keep
    .sort((a, b) => a.i - b.i)
    .map((p) => p.t)
    .join("\n\n");
}
