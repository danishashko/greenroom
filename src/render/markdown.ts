import type { Report } from "../schema.js";
import { pct } from "../util.js";

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function renderMarkdown(r: Report): string {
  const lines: string[] = [];
  lines.push(`# ${r.headline}`, "", `**Change:** ${r.seed.change}`, "", r.readout, "");

  lines.push("## Numbers", "");
  lines.push("| Measure | Value |", "| --- | --- |");
  if (r.ensemble.samples > 1) {
    const e = r.ensemble;
    lines.push(`| Samples | ${e.samples} (figures below are the median sample) |`);
    lines.push(`| Negative across samples | ${pct(e.negativeShare.median)} (${pct(e.negativeShare.min)} to ${pct(e.negativeShare.max)}) |`);
    lines.push(`| Would leave across samples | ${pct(e.leaveShare.median)} (${pct(e.leaveShare.min)} to ${pct(e.leaveShare.max)}) |`);
  }
  lines.push(`| Negative | ${pct(r.stats.negativeShare)} |`);
  lines.push(`| Neutral | ${pct(r.stats.neutralShare)} |`);
  lines.push(`| Positive | ${pct(r.stats.positiveShare)} |`);
  lines.push(`| Would leave or switch | ${pct(r.stats.leaveShare)} |`);
  lines.push(`| Changed stance after seeing others | ${pct(r.stats.movedMindShare)} |`);
  lines.push(`| Confidence | ${r.basis.confidence} (${r.basis.confidenceReason}) |`, "");

  lines.push("### Actions in the next 30 days", "");
  for (const [k, v] of Object.entries(r.stats.actions).sort((a, b) => b[1] - a[1])) lines.push(`- ${k.replace("_", " ")}: ${pct(v)}`);
  lines.push("");

  if (r.themes.length) {
    lines.push("## Objections", "");
    for (const t of r.themes) {
      lines.push(`### ${t.label} (${pct(t.weight)} of audience)`, "");
      for (const q of t.quotes) lines.push(`> ${q.quote.replace(/\n/g, " ")}`, `> [${q.evidenceId}] ${q.url}`, "");
    }
  }

  lines.push("## What to change", "");
  r.recommendations.forEach((rec, i) => {
    lines.push(`${i + 1}. **${rec.change}** ${rec.why} Expected effect: ${rec.expectedEffect}${rec.evidenceIds.length ? ` (${rec.evidenceIds.join(", ")})` : ""}`);
  });
  lines.push("");

  if (r.riskiestSegment) {
    const p = r.personas.find((x) => x.id === r.riskiestSegment?.personaId);
    lines.push(`**Most at risk:** ${p ? `${p.name}, ${p.role}` : r.riskiestSegment.personaId}. ${r.riskiestSegment.why}`, "");
  }

  lines.push("## Personas", "");
  lines.push("| Persona | Share | Final stance | Action | Reason |", "| --- | --- | --- | --- | --- |");
  for (const p of r.personas) {
    const last = r.reactions.filter((x) => x.personaId === p.id && x.round === r.stats.rounds)[0];
    lines.push(`| ${cell(`${p.name}, ${p.role}`)} | ${pct(p.weight)} | ${last?.stance ?? ""} | ${last ? last.action.replace("_", " ") : ""} | ${cell(last?.reasoning ?? "")} |`);
  }
  lines.push("");

  lines.push("## Basis", "");
  lines.push(`- Type: simulated reactions, not measured behavior`);
  lines.push(`- Quotes: ${r.basis.evidenceCount} from ${r.basis.domainCount} domains via ${r.basis.groundingProvider}`);
  if (r.basis.asOf) lines.push(`- Cut-off: ${r.basis.asOf}, ${r.basis.droppedAfterCutoff} later results or quotes left out`);
  lines.push(`- Personas: ${r.stats.personas}, rounds: ${r.stats.rounds}`);
  lines.push(`- Models: ${r.basis.llmProvider} (${r.basis.models.fast} / ${r.basis.models.strong})`);
  lines.push(`- Calls: ${r.usage.calls}, time: ${r.usage.seconds}s${r.usage.listPriceUsd !== null ? `, list-price equivalent: $${r.usage.listPriceUsd}` : ""}`);
  lines.push("");

  if (r.evidence.length) {
    lines.push("## Evidence", "");
    for (const e of r.evidence) lines.push(`- [${e.id}] (${e.source}) "${e.quote.replace(/\n/g, " ")}" ${e.url}`);
    lines.push("");
  }
  lines.push(`Run ${r.runId}, ${r.createdAt}`, "");
  return lines.join("\n");
}
