import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { cleanMarkdown, focusText, seedTerms } from "../ground/clean.js";
import { classifySource } from "../ground/types.js";
import { extractPrompt, queriesPrompt, SYSTEM_ANALYST } from "../prompts.js";
import type { Evidence } from "../schema.js";
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
  /** Search results and quotes left out because they are dated after the cut-off. */
  droppedAfterCutoff?: number;
}

/** A YYYY-MM-DD date that is strictly after the cut-off. Unknown or malformed dates are kept. */
export function isAfterCutoff(date: string | undefined, asOf: string | undefined): boolean {
  if (!date || !asOf || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date > asOf;
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
  let dropped = 0;
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
    const q = await llm.complete({ system: SYSTEM_ANALYST, prompt: queriesPrompt(seed, g.maxQueries), schema: QueriesSchema, label: "ground:queries", tier: "fast" });
    const queries = q.data.queries.slice(0, g.maxQueries);
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
      .sort((a, b) => Number(b.kind !== "web") - Number(a.kind !== "web"));
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
        warnings.push(`Could not read ${url}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    });
    const ok = fetched.filter((f): f is NonNullable<typeof f> => !!f && f.text.trim().length > 200);
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
          out.push({
            id: "",
            source: pg.via === "user" ? "user" : classifySource(domain),
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
  if (dropped) warnings.push(`Left out ${dropped} results or quotes dated after ${seed.asOf}.`);
  return { evidence, productContext, warnings, droppedAfterCutoff: dropped };
}
