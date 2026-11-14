import type { Evidence, Persona, Reaction, Seed } from "./schema.js";

export const SYSTEM_ANALYST =
  "You are a careful market researcher. You work only from the material given. You never invent quotes, numbers or sources. You answer with one JSON object that matches the requested schema and nothing else.";

export const SYSTEM_ROLEPLAY =
  "You play one specific buyer in a market simulation. Stay in character. Real buyers are busy, skeptical and usually do not act on announcements right away. You answer with one JSON object that matches the requested schema and nothing else.";

export function seedBlock(seed: Seed, productContext?: string): string {
  const lines = [
    `Change being rehearsed: ${seed.change}`,
    `Kind: ${seed.kind}`,
    seed.productName ? `Product: ${seed.productName}` : "",
    seed.productUrl ? `Product page: ${seed.productUrl}` : "",
    seed.audience ? `Audience: ${seed.audience}` : "",
    seed.competitors.length ? `Competitors buyers compare against: ${seed.competitors.join(", ")}` : "",
    seed.context ? `Extra context: ${seed.context}` : "",
    seed.asOf ? `Today is ${seed.asOf}. The change is being announced now. Nothing after this date has happened yet.` : "",
    productContext ? `Product page text (may be partial):\n${productContext}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function queriesPrompt(seed: Seed, max: number): string {
  return `${seedBlock(seed)}

Write up to ${max} web search queries that find real people discussing this product category, its pricing, alternatives and complaints. Favor community and review sources: Reddit, Hacker News, G2, Capterra, Trustpilot, forums. Mix queries about the product itself, its competitors, and the pain the product solves. Each query must work in Google. Do not include the change itself if it is not public yet.${seed.asOf ? " Do not search for reactions to the change or for what happened after it." : ""}`;
}

export function extractPrompt(seed: Seed, url: string, pageText: string): string {
  return `${seedBlock(seed)}

Source URL: ${url}

Page text:
"""
${pageText}
"""

Extract up to 6 quotes from real people (customers, users, commenters, reviewers) who express an opinion or experience relevant to this product, its category, pricing or alternatives. Rules:
- Copy each quote exactly as written on the page. Do not paraphrase, merge or fix typos.
- Each quote is one to three sentences and at most 400 characters.
- Skip vendor marketing copy, navigation text and anything without a real person's view.
- Do not include usernames, names, emails or phone numbers.
- Add a short context note: what the quote is replying to or what the author's situation is.
- date: the day the quote was written as YYYY-MM-DD, only when the page shows it exactly near that quote. Otherwise leave it empty.
Return an empty list if nothing qualifies.`;
}

export function personasPrompt(seed: Seed, evidence: Evidence[], n: number, productContext?: string, ungrounded = false): string {
  const ev = evidence.length
    ? evidence.map((e) => `[${e.id}] (${e.source}, ${e.domain}) ${e.quote}`).join("\n")
    : "(no source evidence available)";
  return `${seedBlock(seed, productContext)}

Real quotes collected from the web:
${ev}

Build exactly ${n} distinct buyer personas that together cover the audience for this product. ${
    ungrounded
      ? "There is no source evidence, so build them from the description only and leave evidenceIds empty."
      : "Ground every persona in the quotes: list in evidenceIds every evidence id that fits it, at least 2, only ids shown above. A quote may support more than one persona. Audience share is computed from how many quotes back each persona, so do not pad or trim the list."
  }
For each persona give: a first name and initial, a specific role, a segment label (2 to 4 words), a two sentence summary, 2 to 4 goals, 2 to 4 objections that are likely to matter for the change above, price sensitivity (low, medium, high), and the current solution they use today. Include at least one persona who is likely to be unhappy about the change and one who is a champion if the evidence supports both.`;
}

export function reactionPrompt(args: {
  seed: Seed;
  productContext?: string;
  persona: Persona;
  ownEvidence: Evidence[];
  round: number;
  rounds: number;
  digest?: string;
}): string {
  const { seed, persona, ownEvidence, round, rounds, digest } = args;
  const quotes = ownEvidence.length ? ownEvidence.map((e) => `[${e.id}] ${e.quote}`).join("\n") : "(none)";
  const roundNote =
    round === 1
      ? "You just saw the announcement. React as you would on first read."
      : round === rounds
        ? "This is your final decision after seeing how others reacted. Commit to what you will actually do."
        : "You have now seen how others reacted. You may keep or change your view. Change it only if someone raised a point that matters to you.";
  return `${seedBlock(seed, args.productContext)}

You are ${persona.name}, ${persona.role} (${persona.segment}).
${persona.summary}
Goals: ${persona.goals.join("; ")}
Concerns: ${persona.objections.join("; ")}
Price sensitivity: ${persona.priceSensitivity}
Uses today: ${persona.currentSolution}

Things people like you have actually said:
${quotes}

Round ${round} of ${rounds}. ${roundNote}
${digest ? `\nWhat others said so far:\n${digest}\n` : ""}
Give your reaction. stance runs from -2 (hostile) to 2 (enthusiastic). action is what you will do in the next 30 days. Be specific to your situation, name real alternatives when you would switch, and list your concrete objections. Cite evidence ids from your list only when a quote truly supports your reasoning. wouldChangeMindIf is one sentence.`;
}

/**
 * What one persona hears from the others. Always includes the most negative and the most
 * positive voice so every persona meets the strongest case on both sides, then fills the
 * rest in an order rotated per persona, so no single voice reaches everyone first.
 */
export function digestFrom(reactions: Reaction[], personas: Persona[], rotate = 0, size = 5): string {
  const byId = new Map(personas.map((p) => [p.id, p]));
  const counts = { neg: 0, neu: 0, pos: 0 };
  for (const r of reactions) {
    if (r.stance < 0) counts.neg++;
    else if (r.stance > 0) counts.pos++;
    else counts.neu++;
  }
  const lines = [`${reactions.length} other buyers: ${counts.neg} negative, ${counts.neu} neutral, ${counts.pos} positive.`];
  const byStance = [...reactions].sort((a, b) => a.stance - b.stance);
  const picked: Reaction[] = [];
  const add = (r: Reaction | undefined) => r && !picked.includes(r) && picked.length < size && picked.push(r);
  add(byStance[0]);
  add(byStance[byStance.length - 1]);
  const n = reactions.length;
  for (let i = 0; i < n; i++) add(reactions[(i + rotate) % n]);
  for (const r of picked) {
    const p = byId.get(r.personaId);
    lines.push(`- A ${p?.role ?? "buyer"} (${r.action.replace("_", " ")}): ${r.reasoning.slice(0, 220)}`);
  }
  return lines.join("\n");
}

export function themesPrompt(items: string[]): string {
  return `These are objections raised by simulated buyers, numbered from 0:
${items.map((t, i) => `${i}: ${t}`).join("\n")}

Group them into at most 6 themes. Each theme gets a short plain label (3 to 7 words, no jargon) and the list of objection numbers it covers. Every number appears in at most one theme. Leave out objections that fit no theme.`;
}

export function verdictPrompt(args: {
  seed: Seed;
  statsText: string;
  themes: { label: string; weight: number }[];
  personas: Persona[];
  evidence: Evidence[];
  lastReactions: Reaction[];
}): string {
  const { seed, statsText, themes, personas, evidence, lastReactions } = args;
  const pLines = personas.map((p) => {
    const r = lastReactions.find((x) => x.personaId === p.id);
    return `${p.id} ${p.name}, ${p.role}, share ${Math.round(p.weight * 100)}%: stance ${r?.stance ?? "?"}, action ${r?.action ?? "?"}. ${r?.reasoning.slice(0, 200) ?? ""}`;
  });
  const ev = evidence.slice(0, 40).map((e) => `[${e.id}] ${e.quote.slice(0, 200)}`).join("\n");
  return `${seedBlock(seed)}

Simulation results (weighted by audience share):
${statsText}

Objection themes:
${themes.map((t) => `- ${t.label} (${Math.round(t.weight * 100)}% of audience)`).join("\n")}

Personas and final reactions:
${pLines.join("\n")}

Available evidence:
${ev || "(none)"}

Write:
1. readout: two or three plain sentences saying what happens if this change ships as described, with the main reason. No hedging filler, no mention of simulation or method.
2. recommendations: one to four concrete changes to the plan or its wording that would reduce the main objections. Each has change, why, expectedEffect (one sentence), and evidenceIds (only ids listed above, may be empty).
3. riskiest: the persona id most likely to be lost or most hostile, and why in one sentence.`;
}
