import { ROOM_CSS, ROOM_JS, roomSection } from "./room.js";
import { cutoffLine, mixLine, money, signedMoney } from "../pipeline/report.js";
import type { Report } from "../schema.js";
import { pct } from "../util.js";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Tokens come from the Bright Data design guidelines (v1.0, June 2026). Dark-first, blue as the single accent, pink sparing. */
const CSS = `
:root{
  --blue-100:#F5F8FF;--blue-200:#E7EEFF;--blue-300:#C6DBFF;--blue-400:#9FC0FF;--blue-500:#76A5FF;--blue-600:#3D7FFC;--blue-700:#22395B;--blue-800:#092349;--blue-900:#091B36;
  --pink-200:#F161A6;--pink-300:#EB378C;--pink-400:#C8187A;
  --gray-100:#EDF1F6;--gray-200:#D2DCE4;--gray-300:#B8C4D0;--gray-400:#8599AC;--gray-500:#5D6E7D;--gray-600:#303B45;
  --w100:#fff;--w80:rgba(255,255,255,.8);--w50:rgba(255,255,255,.5);--w20:rgba(255,255,255,.2);--w06:rgba(255,255,255,.06);
  --r-sm:8px;--r-md:16px;--r-lg:32px;--r-pill:999px;
  --grad-chart:linear-gradient(115deg,#3D7FFC,#EB378C);
  --shadow-md:0 8px 24px rgba(0,0,0,.28);
  --font:"Gibson","Inter","Segoe UI",system-ui,-apple-system,Roboto,sans-serif;
  --t-fast:120ms;--t-base:200ms;
}
*{box-sizing:border-box}
html{background:var(--blue-900)}
body{margin:0;background:var(--blue-900);color:var(--w100);font-family:var(--font);font-weight:300;font-size:18px;line-height:1.6;letter-spacing:.01em;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:56px 24px 96px}
.kicker{font-size:16px;font-weight:500;text-transform:uppercase;letter-spacing:.16em;color:var(--w80);margin:0 0 16px}
h1{font-weight:600;font-size:clamp(30px,4.2vw,46px);line-height:1.1;letter-spacing:.02em;margin:0 0 24px;max-width:28ch}
h2{font-weight:500;font-size:32px;line-height:1.2;letter-spacing:.02em;margin:72px 0 24px}
h3{font-weight:500;font-size:20px;line-height:1.3;letter-spacing:.02em;margin:0 0 8px}
p{margin:0 0 16px}
a{color:var(--blue-500);text-decoration:none;transition:color var(--t-fast) ease-out}
a:hover{color:var(--blue-300)}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--blue-600);outline-offset:3px;border-radius:var(--r-sm)}
.change{color:var(--w80);margin:0 0 24px;max-width:60ch}
.readout{font-size:20px;max-width:62ch;margin:0 0 40px}
.hero{display:grid;grid-template-columns:1fr minmax(220px,320px);gap:40px;align-items:center}
.swarm{width:100%;height:auto}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:0}
.stat{background:var(--w06);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--w20);border-radius:var(--r-md);padding:24px}
.stat .n{font-weight:600;font-size:44px;line-height:1.05;letter-spacing:.02em}
.stat .l{color:var(--w80);font-size:16px;margin-top:8px}
.stat.warn .n{color:var(--pink-200)}
.card{background:var(--w06);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--w20);border-radius:var(--r-md);padding:24px;transition:transform var(--t-base) ease-out,border-color var(--t-base) ease-out}
.card:hover{transform:translateY(-2px);border-color:var(--w50)}
.stack{display:flex;height:16px;border-radius:var(--r-pill);overflow:hidden;background:var(--blue-800)}
.stack i{display:block;height:100%}
.legend{display:flex;gap:24px;flex-wrap:wrap;margin-top:12px;color:var(--w80);font-size:16px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px}
.bars{display:grid;gap:12px}
.bar{display:grid;grid-template-columns:160px 1fr 56px;gap:16px;align-items:center;font-size:16px}
.bar .track{height:12px;background:var(--blue-800);border-radius:var(--r-pill);overflow:hidden}
.bar .fill{height:100%;background:var(--grad-chart);border-radius:var(--r-pill)}
.bar .v{text-align:right;color:var(--w80)}
.themes{display:grid;gap:16px}
.theme .meta{color:var(--w80);font-size:16px;margin-bottom:12px}
blockquote{margin:12px 0 0;padding:0 0 0 16px;border-left:2px solid var(--blue-600);color:var(--gray-200);font-size:16px}
blockquote cite{display:block;margin-top:4px;color:var(--gray-400);font-style:normal;font-size:14px;word-break:break-all}
.recs{counter-reset:r;display:grid;gap:16px;padding:0;margin:0;list-style:none}
.recs li{counter-increment:r;position:relative;padding-left:56px}
.recs li::before{content:counter(r);position:absolute;left:0;top:0;width:36px;height:36px;border-radius:50%;border:1px solid var(--blue-600);display:flex;align-items:center;justify-content:center;font-weight:500;color:var(--blue-400)}
.recs .eff{color:var(--w80);font-size:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.pill{display:inline-block;border:1px solid var(--w20);border-radius:var(--r-pill);padding:2px 12px;font-size:14px;color:var(--w80);margin:0 8px 8px 0}
.pill.neg{border-color:var(--pink-300);color:var(--pink-200)}
.pill.pos{border-color:var(--blue-600);color:var(--blue-400)}
.persona .role{color:var(--w80);font-size:16px;margin:0 0 12px}
.persona .why{font-size:16px;color:var(--gray-200);margin:12px 0 0}
.persona{align-self:start}
.persona details{border:0;padding:0;background:none;margin-top:4px}
.persona summary{font-size:14px;color:var(--blue-400);justify-content:flex-start;gap:8px}
.persona summary::before{content:'+';width:14px}
.persona details[open] summary::before{content:'\\2212'}
table{width:100%;border-collapse:collapse;font-size:16px}
th,td{text-align:left;padding:12px 16px 12px 0;border-bottom:1px solid var(--w20);vertical-align:top}
th{font-weight:500;color:var(--w80);width:34%}
.seg th{width:auto}
details{border:1px solid var(--w20);border-radius:var(--r-md);padding:16px 24px;background:var(--w06)}
summary{cursor:pointer;font-weight:500;list-style:none;display:flex;justify-content:space-between;transition:color var(--t-fast) ease-out}
summary:hover{color:var(--blue-300)}
summary::-webkit-details-marker{display:none}
.ev{padding:12px 0;border-top:1px solid var(--w20);font-size:16px}
.ev small{display:block;color:var(--gray-400);word-break:break-all}
.btn{display:inline-flex;align-items:center;height:38px;padding:0 20px;border-radius:var(--r-pill);border:1px solid var(--w50);background:transparent;color:var(--w100);font:500 16px var(--font);cursor:pointer;transition:background var(--t-fast) ease-out,color var(--t-fast) ease-out}
.btn:hover{background:var(--w100);color:var(--blue-900)}
.btn.primary{background:var(--blue-600);border-color:var(--blue-600)}
.btn.primary:hover{background:var(--w100);border-color:var(--w100);color:var(--blue-900)}
.actions{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
footer{margin-top:96px;padding-top:24px;border-top:1px solid var(--w20);color:var(--w80);font-size:16px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
@media (max-width:860px){.hero{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}.bar{grid-template-columns:110px 1fr 48px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
@media print{
  html,body{background:#fff;color:#2C3132}
  .stat,.card,details{background:#fff;border-color:#D2DCE4;backdrop-filter:none}
  .kicker,.change,.stat .l,.legend,.bar .v,.theme .meta,.persona .role,footer,th{color:#4A5053}
  blockquote{color:#303B45}.btn,.actions{display:none}details[open] summary{margin-bottom:8px}
}
`;

/** Only http(s) URLs become links. Anything else (javascript:, data:, file paths) is shown as text. */
function link(url: string): string {
  return /^https?:\/\//i.test(url) ? `<a href="${esc(url)}" rel="noopener noreferrer nofollow">${esc(url)}</a>` : esc(url);
}

const STANCE_COLOR: Record<string, string> = { neg: "var(--pink-300)", neu: "var(--gray-400)", pos: "var(--blue-600)" };

function stanceKey(n: number): "neg" | "neu" | "pos" {
  return n < 0 ? "neg" : n > 0 ? "pos" : "neu";
}

/** Concept visual: one circle per persona, sized by audience share, colored by final stance. */
function swarmSvg(r: Report): string {
  const last = r.reactions.filter((x) => x.round === r.stats.rounds);
  const n = r.personas.length;
  const cx = 160;
  const cy = 120;
  const circles = r.personas
    .map((p, i) => {
      const s = last.find((x) => x.personaId === p.id)?.stance ?? 0;
      const ring = i % 2 === 0 ? 70 : 38;
      const a = (i / n) * Math.PI * 2 + (i % 2) * 0.5;
      const rad = 10 + p.weight * 70;
      const x = cx + Math.cos(a) * ring * (n > 6 ? 1.15 : 0.9);
      const y = cy + Math.sin(a) * ring * 0.85;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${STANCE_COLOR[stanceKey(s)]}" fill-opacity=".85"><title>${esc(p.name)}: ${s}</title></circle>`;
    })
    .join("");
  return `<svg class="swarm" viewBox="0 0 320 240" role="img" aria-label="Personas colored by final stance"><circle cx="${cx}" cy="${cy}" r="108" fill="none" stroke="rgba(255,255,255,.2)"/><circle cx="${cx}" cy="${cy}" r="72" fill="none" stroke="rgba(255,255,255,.2)" stroke-dasharray="2 6"/>${circles}</svg>`;
}

export function renderHtml(r: Report): string {
  const last = (pid: string) => r.reactions.find((x) => x.personaId === pid && x.round === r.stats.rounds);
  const s = r.stats;
  const e = r.ensemble;
  const multi = e.samples > 1;
  const risk = s.atRisk;
  const priced = s.segments.some((x) => x.mrrAfter !== null);
  const segRows = s.segments
    .map(
      (x) =>
        `<tr><th>${esc(x.name)}</th><td>${x.customers.toLocaleString("en-US")} (${pct(x.share)})</td><td>${x.negativeShare === null ? "no persona" : pct(x.negativeShare)}</td><td>${x.leaveShare === null ? "" : pct(x.leaveShare)}</td><td>${x.customersAtRisk === null ? "" : x.customersAtRisk.toLocaleString("en-US")}</td>${risk?.mrr !== null && risk ? `<td>${x.mrrAtRisk === null ? "" : esc(money(x.mrrAtRisk, risk.currency))}</td>` : ""}${priced ? `<td>${x.netMrrChange === null ? "" : esc(signedMoney(x.netMrrChange, risk?.currency ?? "USD"))}</td><td>${x.breakEvenLeaveShare === null ? "" : pct(x.breakEvenLeaveShare)}</td>` : ""}</tr>`,
    )
    .join("");
  const segTable = s.segments.length
    ? `<h2>By customer segment</h2><div class="card"><table class="seg"><tr><th>Segment</th><th>Customers</th><th>Negative</th><th>Would leave</th><th>Customers at risk</th>${risk?.mrr !== null ? "<th>Revenue at risk</th>" : ""}${priced ? "<th>Net revenue</th><th>Breaks even if leave under</th>" : ""}</tr>${segRows}</table>${
        risk
          ? `<p class="legend" style="margin-top:16px">${risk.customers.toLocaleString("en-US")} customers (${pct(risk.customerShare)})${risk.mrr !== null ? ` and ${esc(money(risk.mrr, risk.currency))} of monthly revenue (${pct(risk.mrrShare ?? 0)})` : ""} at risk.${risk.netMrrChange !== null ? ` Net monthly revenue after the change: ${esc(signedMoney(risk.netMrrChange, risk.currency))}. Downgrades are not counted.` : ""}${risk.uncoveredCustomers ? ` ${risk.uncoveredCustomers.toLocaleString("en-US")} customers sit in segments without a persona and are not counted.` : ""}</p>`
          : ""
      }</div>`
    : "";
  const sub = (x: { min: number; max: number }) => (multi && Math.round(x.min * 100) !== Math.round(x.max * 100) ? `, range ${Math.round(x.min * 100)} to ${pct(x.max)}` : "");

  const stats = `
  <div class="stats">
    ${
      risk && e.netMrrChange
        ? `<div class="stat${e.netMrrChange.median < 0 ? " warn" : ""}"><div class="n">${esc(signedMoney(e.netMrrChange.median, risk.currency))}</div><div class="l">net monthly revenue after the change${multi && e.netMrrChange.min !== e.netMrrChange.max ? `, range ${esc(signedMoney(e.netMrrChange.min, risk.currency))} to ${esc(signedMoney(e.netMrrChange.max, risk.currency))}` : ""}</div></div>`
        : `<div class="stat${e.leaveShare.median >= 0.25 ? " warn" : ""}"><div class="n">${pct(e.leaveShare.median)}</div><div class="l">would leave or switch${sub(e.leaveShare)}</div></div>`
    }
    <div class="stat${e.negativeShare.median >= 0.5 ? " warn" : ""}"><div class="n">${pct(e.negativeShare.median)}</div><div class="l">react negatively${sub(e.negativeShare)}</div></div>
    ${
      risk && e.customersAtRisk
        ? e.mrrAtRisk
          ? `<div class="stat warn"><div class="n">${esc(money(e.mrrAtRisk.median, risk.currency))}</div><div class="l">monthly revenue at risk${multi && e.mrrAtRisk.min !== e.mrrAtRisk.max ? `, range ${esc(money(e.mrrAtRisk.min, risk.currency))} to ${esc(money(e.mrrAtRisk.max, risk.currency))}` : ""}</div></div>`
          : `<div class="stat warn"><div class="n">${e.customersAtRisk.median.toLocaleString("en-US")}</div><div class="l">customers at risk${multi && e.customersAtRisk.min !== e.customersAtRisk.max ? `, range ${e.customersAtRisk.min.toLocaleString("en-US")} to ${e.customersAtRisk.max.toLocaleString("en-US")}` : ""}</div></div>`
        : `<div class="stat"><div class="n">${pct(e.positiveShare.median)}</div><div class="l">react positively${sub(e.positiveShare)}</div></div>`
    }
    <div class="stat"><div class="n">${esc(r.basis.confidence)}</div><div class="l">confidence, ${r.basis.evidenceCount} quotes</div></div>
  </div>`;

  const stack = `
  <div class="stack" role="img" aria-label="Stance split">
    <i style="width:${s.negativeShare * 100}%;background:${STANCE_COLOR["neg"]}"></i>
    <i style="width:${s.neutralShare * 100}%;background:${STANCE_COLOR["neu"]}"></i>
    <i style="width:${s.positiveShare * 100}%;background:${STANCE_COLOR["pos"]}"></i>
  </div>
  <div class="legend"><span><span class="dot" style="background:${STANCE_COLOR["neg"]}"></span>Negative ${pct(s.negativeShare)}</span><span><span class="dot" style="background:${STANCE_COLOR["neu"]}"></span>Neutral ${pct(s.neutralShare)}</span><span><span class="dot" style="background:${STANCE_COLOR["pos"]}"></span>Positive ${pct(s.positiveShare)}</span></div>`;

  const actions = Object.entries(s.actions)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<div class="bar"><span>${esc(k.replace("_", " "))}</span><span class="track"><span class="fill" style="display:block;width:${Math.max(2, v * 100)}%"></span></span><span class="v">${pct(v)}</span></div>`)
    .join("");

  const themes = r.themes
    .map(
      (t) => `<div class="card theme"><h3>${esc(t.label)}</h3><div class="meta">${pct(t.weight)} of the audience</div>${t.quotes
        .map((q) => `<blockquote>${esc(q.quote)}<cite>${link(q.url)}</cite></blockquote>`)
        .join("")}</div>`,
    )
    .join("");

  const recs = r.recommendations
    .map((x) => `<li><h3>${esc(x.change)}</h3><p>${esc(x.why)}</p><p class="eff">${esc(x.expectedEffect)}</p></li>`)
    .join("");

  const risky = r.riskiestSegment ? r.personas.find((p) => p.id === r.riskiestSegment?.personaId) : undefined;

  const personas = r.personas
    .map((p) => {
      const l = last(p.id);
      const k = stanceKey(l?.stance ?? 0);
      return `<div class="card persona"><h3>${esc(p.name)}</h3><p class="role">${esc(p.role)}, ${esc(p.segment)}${p.customerSegment ? ` (${esc(p.customerSegment)})` : ""}</p>
      <span class="pill ${k}">${l ? esc(l.action.replace("_", " ")) : "n/a"}</span><span class="pill">${pct(p.weight)} of audience</span><span class="pill">${esc(p.priceSensitivity)} price sensitivity</span>
      <details><summary>What they would do</summary><p class="why">${esc(l?.reasoning ?? p.summary)}</p></details></div>`;
    })
    .join("");

  const basisRows: [string, string][] = [
    ["Type", "Simulated reactions"],
    ["Quotes", `${r.basis.evidenceCount} from ${r.basis.domainCount} sources via ${r.basis.groundingProvider}${r.basis.customerQuotes ? `, ${r.basis.customerQuotes} from your customer data` : ""}`],
    ["Audience shares", r.basis.weighting === "segments" ? "Anchored to your customer counts per segment" : "From how many quotes back each persona"],
    ["Personas and rounds", `${s.personas} personas, ${s.rounds} rounds`],
    ["Samples", multi ? `${e.samples} independent persona sets. Charts and personas below are from the median sample. Would leave per sample: ${e.perSample.map((x) => pct(x.leaveShare)).join(", ")}` : "1"],
    ["Stance changed after seeing others", pct(s.movedMindShare)],
    ["Models", `${r.basis.llmProvider}: ${r.basis.models.fast} and ${r.basis.models.strong}`],
    ["Calls and time", `${r.usage.calls} calls, ${r.usage.seconds}s${r.usage.listPriceUsd !== null ? `, list-price equivalent $${r.usage.listPriceUsd}` : ""}`],
    ...(mixLine(r) ? ([["Quote tone", mixLine(r)]] as [string, string][]) : []),
    ...(r.basis.asOf ? ([["Cut-off", cutoffLine(r)]] as [string, string][]) : []),
    ["Confidence", `${r.basis.confidence}. ${r.basis.confidenceReason}`],
  ];
  const basis = basisRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");

  const evidence = r.evidence
    .map((e) => `<div class="ev"><strong>${esc(e.id)}</strong> ${esc(e.quote)}<small>${esc(e.source)}${e.date ? `, ${e.dateFrom === "page" ? "on or before " : ""}${esc(e.date)}` : ""}${e.tone ? `, ${esc(e.tone)}` : ""}, ${link(e.url)}</small></div>`)
    .join("");

  const data = JSON.stringify(r).replace(/</g, "\\u003c");
  const creditBD = r.basis.groundingProvider === "brightdata" ? "<span>Web data collected with Bright Data</span>" : "<span></span>";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="color-scheme" content="dark">
<title>${esc(r.headline)}</title>
<style>${CSS}${ROOM_CSS}</style></head>
<body><div class="wrap">
<div class="hero"><div>
<p class="kicker">Rehearsal report</p>
<h1>${esc(r.headline)}</h1>
<p class="change">${esc(r.seed.change)}</p>
<p class="readout">${esc(r.readout)}</p>
</div><div>${swarmSvg(r)}</div></div>
${stats}
<div class="actions"><button class="btn primary" id="copy-json" type="button">Copy JSON</button><button class="btn" id="print" type="button">Print</button></div>

${segTable}

${roomSection(r)}

<h2>Reaction split</h2>
<div class="card">${stack}</div>

<h2>What buyers would do in 30 days</h2>
<div class="card"><div class="bars">${actions}</div></div>

${r.themes.length ? `<h2>Objections</h2><div class="themes">${themes}</div>` : ""}

<h2>What to change</h2>
<ol class="recs">${recs}</ol>
${risky ? `<p style="margin-top:32px"><strong>Most at risk:</strong> ${esc(risky.name)}, ${esc(risky.role)}. ${esc(r.riskiestSegment?.why ?? "")}</p>` : ""}

<h2>Personas</h2>
<div class="grid">${personas}</div>

<h2>Basis</h2>
<table>${basis}</table>

${r.evidence.length ? `<h2>Evidence</h2><details><summary><span>${r.evidence.length} quotes</span><span>Show</span></summary>${evidence}</details>` : ""}

<footer>${creditBD}<span>Run ${esc(r.runId)}</span></footer>
</div>
<script type="application/json" id="report-data">${data}</script>
<script>
document.getElementById('copy-json').addEventListener('click',function(){var b=this;navigator.clipboard.writeText(document.getElementById('report-data').textContent).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy JSON'},1500)})});
document.getElementById('print').addEventListener('click',function(){window.print()});
window.addEventListener('beforeprint',function(){document.querySelectorAll('details').forEach(function(d){d.open=true})});
</script>
<script>${ROOM_JS}</script>
</body></html>`;
}
