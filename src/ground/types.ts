import type { SourceKind } from "../schema.js";

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  /** Publication date when the search engine shows one, as written. */
  date?: string;
}

export interface SearchOptions {
  country?: string;
  /** YYYY-MM-DD. Only results published on or before this day. */
  before?: string;
}

export interface Page {
  url: string;
  markdown: string;
}

export interface GroundProvider {
  id: string;
  label: string;
  canSearch: boolean;
  check(): Promise<{ ok: boolean; detail: string; hint?: string }>;
  search(query: string, opts?: SearchOptions): Promise<SearchHit[]>;
  fetchPage(url: string): Promise<Page>;
}

export function classifySource(domain: string): SourceKind {
  const d = domain.toLowerCase();
  if (d.endsWith("reddit.com")) return "reddit";
  if (d === "news.ycombinator.com" || d === "hn.algolia.com") return "hackernews";
  if (d === "x.com" || d === "twitter.com") return "x";
  if (d.endsWith("linkedin.com")) return "linkedin";
  if (/(g2\.com|capterra\.com|trustpilot\.com|trustradius\.com|gartner\.com|producthunt\.com|getapp\.com|softwareadvice\.com)/.test(d)) return "review";
  if (/(community\.|forum\.|discourse|stackexchange\.com|stackoverflow\.com|quora\.com|indiehackers\.com)/.test(d)) return "forum";
  if (/(techcrunch|theverge|wired|bloomberg|reuters|venturebeat|forbes|zdnet|cnbc|wsj)/.test(d)) return "news";
  return "web";
}
