import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { GreenroomError } from "../errors.js";
import type { Evidence } from "../schema.js";
import { normalizeText, redactPersonalData } from "../util.js";

/**
 * First-party customer text: support tickets, NPS and survey comments, call notes, churn reasons.
 * Rows are used as quotes directly (no model call), so they are exactly what customers wrote.
 */

export interface CustomerColumns {
  text?: string;
  segment?: string;
  date?: string;
}

export interface CustomerData {
  evidence: Evidence[];
  rows: number;
  dropped: number;
  warnings: string[];
}

/** Quotes taken from customer data into the evidence pool. Persona prompts show at most 90 quotes. */
export const CUSTOMER_QUOTE_CAP = 60;
const QUOTE_MAX = 400;
const QUOTE_MIN = 12;

const TEXT_COLS = /^(text|body|message|comments?|feedback|notes?|description|content|quote|transcript|reason|churn_?reason|cancel(lation)?_?reason|response|answer|verbatim|review|summary)$/i;
const SEGMENT_COLS = /^(segment|plan|tier|package|subscription|customer_?segment|plan_?name)$/i;
const DATE_COLS = /^(date|created|created_?at|createdat|timestamp|submitted_?at|time|closed_?at|updated_?at)$/i;

/** RFC 4180 CSV with auto-detected delimiter (comma, semicolon or tab). Quoted fields may span lines. */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  const delim = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0]?.d ?? ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

function readRows(file: string): Record<string, unknown>[] {
  const raw = readFileSync(file, "utf8");
  const ext = path.extname(file).toLowerCase();
  if (ext === ".csv" || ext === ".tsv") return parseCsv(raw);
  if (ext === ".jsonl" || ext === ".ndjson") {
    return raw
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l, i) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          throw new GreenroomError("USAGE", `${file} line ${i + 1} is not valid JSON.`);
        }
      });
  }
  if (ext === ".json") {
    const data = JSON.parse(raw) as unknown;
    const arr = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown }).rows) ? (data as { rows: unknown[] }).rows : null;
    if (!arr) throw new GreenroomError("USAGE", `${file} must hold a JSON array of rows.`);
    return arr.map((x) => (typeof x === "string" ? { text: x } : (x as Record<string, unknown>)));
  }
  throw new GreenroomError("USAGE", `Unsupported customer data file: ${file}`, "Use .csv, .tsv, .json, .jsonl or .ndjson.");
}

function listFiles(paths: string[]): string[] {
  const out: string[] = [];
  const visit = (p: string) => {
    let st;
    try {
      st = statSync(p);
    } catch {
      throw new GreenroomError("USAGE", `Customer data not found: ${p}`);
    }
    if (st.isDirectory()) for (const f of readdirSync(p)) visit(path.join(p, f));
    else if (/\.(csv|tsv|json|jsonl|ndjson)$/i.test(p)) out.push(p);
  };
  for (const p of paths) visit(p);
  return out;
}

/** Pick the text, segment and date columns: an explicit mapping wins, then known names, then the wordiest column. */
export function detectColumns(rows: Record<string, unknown>[], given: CustomerColumns = {}): Required<Pick<CustomerColumns, "text">> & CustomerColumns {
  const keys = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))];
  const check = (name: string | undefined, what: string) => {
    if (name && !keys.includes(name)) throw new GreenroomError("USAGE", `Column "${name}" for ${what} is not in the customer data.`, `Columns found: ${keys.join(", ")}`);
    return name;
  };
  let text = check(given.text, "text") ?? keys.find((k) => TEXT_COLS.test(k));
  if (!text) {
    const avg = (k: string) => rows.slice(0, 50).reduce((s, r) => s + (typeof r[k] === "string" ? (r[k] as string).length : 0), 0);
    text = [...keys].sort((a, b) => avg(b) - avg(a))[0];
  }
  if (!text) throw new GreenroomError("USAGE", "Customer data has no columns.");
  return {
    text,
    segment: check(given.segment, "segment") ?? keys.find((k) => SEGMENT_COLS.test(k)),
    date: check(given.date, "date") ?? keys.find((k) => DATE_COLS.test(k)),
  };
}

/** Whole text when short; otherwise whole sentences from the start up to the cap. Always a verbatim substring. */
export function quoteFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= QUOTE_MAX) return t;
  const cut = t.slice(0, QUOTE_MAX);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 80 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : QUOTE_MAX);
}

export function toIsoDate(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  if (typeof v === "number" || /^\d{9,13}$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n).toISOString().slice(0, 10) : undefined;
  }
  // "March 4, 2026" parses as local midnight; read it back in local time so the day does not shift.
  const d = new Date(Date.parse(s));
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Load customer rows as evidence. Rows dated after asOf are dropped. When there are more rows
 * than the cap, picks spread evenly across segments, wordier rows first within a segment.
 */
export function loadCustomerData(paths: string[], columns: CustomerColumns = {}, asOf?: string): CustomerData {
  const warnings: string[] = [];
  let rowsTotal = 0;
  let dropped = 0;
  const candidates: (Evidence & { score: number })[] = [];
  for (const file of listFiles(paths)) {
    const rows = readRows(file);
    rowsTotal += rows.length;
    if (!rows.length) {
      warnings.push(`No rows in ${file}.`);
      continue;
    }
    const cols = detectColumns(rows, columns);
    rows.forEach((r, i) => {
      // JSON rows can differ in shape: without an explicit mapping, fall back to any text-like field in the row.
      const raw = r[cols.text] ?? (columns.text ? undefined : r[Object.keys(r).find((k) => TEXT_COLS.test(k)) ?? ""]);
      if (typeof raw !== "string" || raw.trim().length < QUOTE_MIN) return;
      const date = cols.date ? toIsoDate(r[cols.date]) : undefined;
      if (asOf && date && date > asOf) {
        dropped++;
        return;
      }
      const quote = redactPersonalData(quoteFrom(raw));
      const segment = cols.segment && r[cols.segment] !== undefined && r[cols.segment] !== "" ? String(r[cols.segment]).trim() : undefined;
      candidates.push({
        id: "",
        source: "customer",
        url: `customer://${path.basename(file)}#row${i + 2}`,
        domain: "customer-data",
        quote,
        segment,
        date,
        via: "customer",
        score: Math.min(quote.length, 300),
      });
    });
  }

  // Dedupe, then spread across segments so one noisy plan cannot fill the pool.
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const k = normalizeText(c.quote);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const bySegment = new Map<string, typeof unique>();
  for (const c of unique) bySegment.set(c.segment ?? "", [...(bySegment.get(c.segment ?? "") ?? []), c]);
  for (const list of bySegment.values()) list.sort((a, b) => b.score - a.score);
  const lists = [...bySegment.values()];
  const picked: Evidence[] = [];
  for (let i = 0; picked.length < CUSTOMER_QUOTE_CAP && lists.some((l) => l[i]); i++) {
    for (const l of lists) {
      const c = l[i];
      if (c && picked.length < CUSTOMER_QUOTE_CAP) {
        const { score: _score, ...e } = c;
        picked.push(e);
      }
    }
  }
  if (unique.length > picked.length) warnings.push(`Used ${picked.length} of ${unique.length} customer rows with text (spread across segments).`);
  return { evidence: picked, rows: rowsTotal, dropped, warnings };
}
