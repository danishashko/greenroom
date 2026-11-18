import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { cleanMarkdown, focusText, seedTerms } from "../ground/clean.js";
import { loadCustomerData } from "../ground/customers.js";
import { classifySource } from "../ground/types.js";
import { extractPrompt, queriesPrompt, SYSTEM_ANALYST } from "../prompts.js";
import type { Evidence, Seed } from "../schema.js";
import { domainOf, normalizeText, pMap, redactPersonalData } from "../util.js";
import type { Ctx } from "./context.js";

const QueriesSchema = z.object({ queries: z.array(z.string().min(3)).min(1).max(12) });
const VoicesSchema = z.object({
  voices: z.array(z.object({ quote: z.string().min(12).max(600), context: z.string().max(300).default(""), date: z.string().optional() })).max(8),
});

/** Raw text kept per page before focusing. Unlocked pages can exceed 300k characters. */
const RAW_CHAR_CAP = 400_000;
/** Text sent to the extraction model per page, after cleaning and relevance ranking. */
const FOCUS_CHAR_CAP = 12_000;
const PRODUCT_CHAR_CAP = 4_000;
/** Search results that never hold buyer text: redirect wrappers and video pages. */
const SKIP_DOMAINS = /(^|\.)(google\.[a-z.]+|youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|facebook\.com)$/;

export interface GroundResult {
  evidence: Evidence[];
  productContext?: string;
  warnings: string[];
  /** Pages that could not be read. Expected: more pages are requested than kept. */
  skipped?: string[];
  /** Search results and quotes left out because they are dated after the cut-off. */
  droppedAfterCutoff?: number;
}

/** A YYYY-MM-DD date that is strictly after the cut-off. Unknown or malformed dates are kept. */
export function isAfterCutoff(date: string | undefined, asOf: string | undefined): boolean {
  if (!date || !asOf || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date > asOf;
}

/**
 * In a backtest, an undated quote from a review site is left out: review pages keep adding
 * reviews after the cut-off, so a search result dated before it can still show later text.
 */
export function undatedReviewInBacktest(source: string, date: string | undefined, asOf: string | undefined): boolean {
  return Boolean(asOf) && source === "review" && !(date && /^\d{4}-\d{2}-\d{2}$/.test(date));
}

/** Returns a checker bound to one page, so the page is normalized once, not once per quote. */
export function verbatimChecker(pageText: string): (quote: string) => boolean {
  const page = normalizeText(pageText);
  return (quote: string) => {
    const q = normalizeText(quote);
    return q.length >= 12 && page.includes(q);
  };
}

/** Keep a quote only if it appears verbatim (after normalizing quotes and spaces) in the source text. */
export function quoteIsVerbatim(quote: string, pageText: string): boolean {
  return verbatimChecker(pageText)(quote);
}

/** Spread picks across domains so one noisy thread cannot dominate. */
const MONTH_INDEX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * The latest calendar date a page shows anywhere ("Jul 17 2026", "July 17, 2026", "17 Jul 2026",
 * "2026-07-17"), ignoring dates after now. In a backtest, a page that shows a date after the cut-off
 * kept growing after it (forum replies, comments, edits), so its undated quotes cannot be trusted.
 */
export function latestDateIn(text: string, now = new Date()): string | undefined {
  const today = now.toISOString().slice(0, 10);
  let latest: string | undefined;
  const consider = (y: number, m: number, d: number) => {
    if (m < 0 || m > 11 || d < 1 || d > 31 || y < 1990) return;
    const iso = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
    if (iso <= today && (!latest || iso > latest)) latest = iso;
  };
  const monthFirst = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;
  const dayFirst = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi;
  for (const m of text.matchAll(monthFirst)) consider(Number(m[3]), MONTH_INDEX[(m[1] as string).toLowerCase()] ?? -1, Number(m[2]));
  for (const m of text.matchAll(dayFirst)) consider(Number(m[3]), MONTH_INDEX[(m[2] as string).toLowerCase()] ?? -1, Number(m[1]));
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) consider(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return latest;
}

/**
 * The latest date a Reddit post could have been written, from the age the page shows next to it
 * ("• 4mo ago"). Reddit rounds ages down, so "4mo ago" means at most four months before now.
 * Returns YYYY-MM-DD, or undefined when the page shows no age.
 */
export function redditPostLatestDate(markdown: string, now = new Date()): string | undefined {
  const m = /•\s*(\d+)\s*(y|yr|mo|w|d|h|min)\.?\s+ago/i.exec(markdown);
  if (!m) return undefined;
  const n = Number(m[1]);
  const d = new Date(now);
  const unit = (m[2] as string).toLowerCase();
  if (unit === "y" || unit === "yr") d.setUTCFullYear(d.getUTCFullYear() - n);
  else if (unit === "mo") d.setUTCMonth(d.getUTCMonth() - n);
  else if (unit === "w") d.setUTCDate(d.getUTCDate() - 7 * n);
  else if (unit === "d") d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Queries that run on every rehearsal of this kind, so the evidence base does not depend only on
 * what the model writes that time. The model fills the remaining slots.
 */
export function coreQueries(seed: Seed): string[] {
  const p = seed.productName?.trim();
  if (!p) return [];
  if (seed.kind === "pricing") return [`${p} price increase`, `${p} too expensive reddit`, `${p} alternatives cheaper`];
  return [`${p} reddit`, `${p} complaints`, `${p} alternatives`];
}

/** Merges core and model queries: core first, case-insensitive duplicates dropped, capped at max. */
export function mergeQueries(core: string[], extra: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of [...core, ...extra]) {
    const k = q.trim().toLowerCase().replace(/\s+/g, " ");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q.trim());
    if (out.length >= max) break;
  }
  return out;
}

export function diversify<T extends { domain: string }>(items: T[], cap: number): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) groups.set(it.domain, [...(groups.get(it.domain) ?? []), it]);
  const out: T[] = [];
  const lists = [...groups.values()];
  for (let i = 0; out.length < cap && lists.some((l) => l[i] !== undefined); i++) {
    for (const l of lists) {
      const it = l[i];
      if (it !== undefined && out.length < cap) out.push(it);
    }
  }
  return out;
}

function readUserEvidence(paths: string[]): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const visit = (p: string) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const f of readdirSync(p)) visit(path.join(p, f));
    } else if (/\.(txt|md|json|csv)$/i.test(p)) {
      out.push({ file: p, text: readFileSync(p, "utf8") });
    }
  };
  for (const p of paths) visit(p);
  return out;
}

export async function groundStage(ctx: Ctx): Promise<GroundResult> {
  const { seed, llm, ground, groundOptions: g } = ctx;
  const warnings: string[] = [];
  const skipped: string[] = [];
  let dropped = 0;
  let undatedReviews = 0;
  const pages: { url: string; text: string; via: string }[] = [];
  const direct: Evidence[] = [];
  let productContext: string | undefined;

  // Product page gives buyers real product facts. It is context, not evidence.
  if (seed.productUrl && ground) {
    try {
      const p = await ground.fetchPage(seed.productUrl);
      productContext = cleanMarkdown(p.markdown).slice(0, PRODUCT_CHAR_CAP);
    } catch (e) {
      warnings.push(`Product page not read: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // First-party customer text is used as written, ahead of everything else.
  if (g.customerPaths.length) {
    const c = loadCustomerData(g.customerPaths, g.customerColumns, seed.asOf);
    direct.push(...c.evidence);
    dropped += c.dropped;
    warnings.push(...c.warnings);
    ctx.emit({ stage: "ground", level: "info", message: `Loaded ${c.evidence.length} customer quotes from ${c.rows} rows` });
  }

  // User-supplied evidence: JSON arrays of quotes are used directly, other files are mined like pages.
  for (const f of readUserEvidence(g.evidencePaths)) {
    if (f.file.toLowerCase().endsWith(".json")) {
      try {
        const arr = JSON.parse(f.text) as unknown;
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const q = typeof item === "string" ? item : (item as { quote?: string }).quote;
            const url = typeof item === "object" && item && "url" in item ? String((item as { url: unknown }).url) : `file://${f.file}`;
            const date = typeof item === "object" && item && "date" in item ? String((item as { date: unknown }).date) : undefined;
            if (isAfterCutoff(date, seed.asOf)) {
              dropped++;
              continue;
            }
            if (q && q.length >= 12) direct.push({ id: "", source: "user", url, domain: domainOf(url) === "unknown" ? "user-supplied" : domainOf(url), quote: redactPersonalData(q.slice(0, 400)), via: "user" });
          }
          continue;
        }
      } catch {
        /* fall through and treat as text */
      }
    }
    pages.push({ url: `file://${f.file}`, text: f.text.slice(0, RAW_CHAR_CAP), via: "user" });
  }

  // Search for real conversations.
  const fetchUrls = new Set<string>(g.urls);
  if (ground?.canSearch && g.maxQueries > 0) {
    ctx.emit({ stage: "ground", level: "info", message: "Writing search queries" });
    const core = coreQueries(seed).slice(0, Math.max(0, g.maxQueries - 1));
    const q = await llm.complete({ system: SYSTEM_ANALYST, prompt: queriesPrompt(seed, g.maxQueries - core.length, core), schema: QueriesSchema, label: "ground:queries", tier: "fast" });
    const queries = mergeQueries(core, q.data.queries, g.maxQueries);
    ctx.emit({ stage: "ground", level: "info", message: `Searching ${queries.length} queries`, data: { queries } });
    const own = seed.productUrl ? domainOf(seed.productUrl) : "";
    const hits = (
      await pMap(queries, 4, async (query) => {
        try {
          return await ground.search(query, { country: g.country, before: seed.asOf });
        } catch (e) {
          warnings.push(`Search failed for "${query}": ${e instanceof Error ? e.message : String(e)}`);
          return [];
        }
      })
    ).flat();
    // A page that several queries return is more likely to be on topic, so it ranks first.
    const hitCount = new Map<string, number>();
    for (const h of hits) {
      const key = h.url.split("#")[0] ?? h.url;
      hitCount.set(key, (hitCount.get(key) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const before = hits.length;
    const inWindow = hits.filter((h) => !isAfterCutoff(h.date, seed.asOf));
    dropped += before - inWindow.length;
    const ranked = inWindow
      .filter((h) => {
        const key = h.url.split("#")[0] ?? h.url;
        if (seen.has(key)) return false;
        seen.add(key);
        const d = domainOf(h.url);
        return !(own && d === own) && !SKIP_DOMAINS.test(d);
      })
      .map((h) => ({ ...h, domain: domainOf(h.url), kind: classifySource(domainOf(h.url)) }))
      .sort(
        (a, b) =>
          Number(b.kind !== "web") - Number(a.kind !== "web") ||
          (hitCount.get(b.url.split("#")[0] ?? b.url) ?? 0) - (hitCount.get(a.url.split("#")[0] ?? a.url) ?? 0),
      );
    // Over-pick, because some pages always fail; the first maxPages successes are kept.
    for (const h of diversify(ranked, Math.ceil(g.maxPages * 1.5))) fetchUrls.add(h.url);
  }

  if (fetchUrls.size && ground) {
    ctx.emit({ stage: "ground", level: "info", message: `Reading ${fetchUrls.size} pages`, data: { via: ground.id } });
    const fetched = await pMap([...fetchUrls], 4, async (url) => {
      try {
        const p = await ground.fetchPage(url);
        return { url, text: p.markdown.slice(0, RAW_CHAR_CAP), via: ground.id };
      } catch (e) {
        skipped.push(`Could not read ${url}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    });
    if (skipped.length) ctx.emit({ stage: "ground", level: "info", message: `Read ${fetchUrls.size - skipped.length} of ${fetchUrls.size} pages (${skipped.length} could not be read)`, data: { skipped } });
    let ok = fetched.filter((f): f is NonNullable<typeof f> => !!f && f.text.trim().length > 200);
    if (seed.asOf) {
      // Reddit threads rarely carry a date in search results, so a thread from after the cut-off
      // (the reaction itself) would slip into a backtest. The page shows the post's age instead.
      const asOf = seed.asOf;
      const before = ok.length;
      ok = ok.filter((f) => !/(^|\.)reddit\.com$/.test(domainOf(f.url)) || !isAfterCutoff(redditPostLatestDate(f.text), asOf));
      dropped += before - ok.length;
    }
    // User URLs always count; search results fill the remaining slots.
    const userUrls = new Set(g.urls);
    let fromSearch = 0;
    for (const f of ok) {
      if (userUrls.has(f.url)) pages.push(f);
      else if (fromSearch < g.maxPages) {
        pages.push(f);
        fromSearch++;
      }
    }
  } else if (fetchUrls.size && !ground) {
    warnings.push("URLs were given but grounding is off (--ground none).");
  }

  // Mine each page for verbatim quotes.
  const mined: Evidence[] = [];
  if (pages.length) {
    ctx.emit({ stage: "ground", level: "info", message: `Extracting quotes from ${pages.length} pages` });
    const terms = seedTerms(seed);
    const results = await pMap(pages, llm.concurrency, async (pg) => {
      // The model sees, and quotes are verified against, the same cleaned and focused text.
      const text = focusText(cleanMarkdown(pg.text), terms, FOCUS_CHAR_CAP);
      if (text.length < 200) return [];
      const isVerbatim = verbatimChecker(text);
      const pageGrewAfterCutoff = !!seed.asOf && isAfterCutoff(latestDateIn(pg.text), seed.asOf);
      try {
        const r = await llm.complete({ system: SYSTEM_ANALYST, prompt: extractPrompt(seed, pg.url, text), schema: VoicesSchema, label: "ground:extract", tier: "fast" });
        const domain = domainOf(pg.url) === "unknown" ? "user-supplied" : domainOf(pg.url);
        const out: Evidence[] = [];
        for (const v of r.data.voices) {
          if (isAfterCutoff(v.date, seed.asOf)) {
            dropped++;
            continue;
          }
          if (!isVerbatim(v.quote)) continue; // drop anything the model reworded
          if (pageGrewAfterCutoff && !(v.date && /^\d{4}-\d{2}-\d{2}$/.test(v.date))) {
            dropped++;
            continue;
          }
          const source = pg.via === "user" ? "user" : classifySource(domain);
          if (undatedReviewInBacktest(source, v.date, seed.asOf)) {
            undatedReviews++;
            continue;
          }
          out.push({
            id: "",
            source,
            url: pg.url,
            domain,
            quote: redactPersonalData(v.quote.trim().slice(0, 400)),
            context: v.context ? redactPersonalData(v.context) : undefined,
            date: v.date && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : undefined,
            via: pg.via,
          });
        }
        return out;
      } catch (e) {
        warnings.push(`Extraction failed for ${pg.url}: ${e instanceof Error ? e.message : String(e)}`);
        return [];
      }
    });
    mined.push(...results.flat());
  }

  // Dedupe by normalized quote, then assign stable ids.
  const seenQuote = new Set<string>();
  const evidence: Evidence[] = [];
  for (const e of [...direct, ...mined]) {
    const key = normalizeText(e.quote);
    if (seenQuote.has(key)) continue;
    seenQuote.add(key);
    evidence.push({ ...e, id: `e${evidence.length + 1}` });
  }
  if (dropped) ctx.emit({ stage: "ground", level: "info", message: `Left out ${dropped} ${dropped === 1 ? "result or quote" : "results or quotes"} dated after ${seed.asOf}` });
  if (undatedReviews) ctx.emit({ stage: "ground", level: "info", message: `Left out ${undatedReviews} undated review-site ${undatedReviews === 1 ? "quote" : "quotes"}, since review pages keep growing after ${seed.asOf}` });
  return { evidence, productContext, warnings, skipped, droppedAfterCutoff: dropped + undatedReviews };
}
