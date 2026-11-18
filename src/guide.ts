/**
 * The one guide for agents that operate greenroom. Served as the MCP server's
 * instructions and printed by `greenroom guide`, so every entry point says the same thing.
 */
export const AGENT_GUIDE = `greenroom rehearses a launch, pricing change or repositioning against simulated buyers built from real, verbatim quotes, and returns the share who react badly, who would leave, the objections with source quotes, and changes that would soften them.

WORKFLOW
1. greenroom_doctor (CLI: greenroom doctor --json). Use recommendedLlm as llm, or omit llm to auto-detect.
2. greenroom_estimate. Read estimate.calls.total, estimate.seconds and estimate.cost. On a paid API backend, tell the user the cost before starting when cost.usd is unknown or above what they expect.
3. greenroom_start. Returns jobId at once.
4. greenroom_status with waitSeconds 55 until status is complete or failed. Do not poll faster.
5. greenroom_report with format summary. Ask for full only when you need a persona, a reaction or a quote.

TIME AND COST (claude-cli on a subscription, defaults)
- Default run (8 personas, 3 rounds, 3 samples, 12 pages): about 90 calls, 7 minutes, 280k input tokens.
- Quick look (samples 1): about 35 calls, 3 minutes, 110k input tokens.
- Bright Data grounding adds about 6 searches and 12 to 18 page reads.

WRITING THE SEED
- change: one concrete sentence with numbers and dates. "Raise Pro from $49 to $79 per month for new and existing customers from January 1."
- Set kind, productName, audience and competitors when known. A vague audience gives vague personas.
- Pass productUrl so personas know the real product.
- Never put the expected outcome in change or context.
- The user's own customer text beats the web. When they have support tickets, survey or NPS comments, call notes or churn reasons, pass the files as customerPaths (CLI --customers). Rows are used as written.
- Ask the user for their customer count per segment (plan or tier), with monthly revenue if they share it, and pass segments. Audience shares then match their real base and the report gives customers and revenue at risk. Never guess these numbers.
- For a price change, also set mrrAfter on each segment whose price changes: its monthly revenue at the new price if nobody left. The report then gives net monthly revenue after the change and the leave share at which each segment breaks even.
- Backtest a past change: set asOf to the day before it was first announced (check the earliest customer notice, not the day press coverage peaked), then compare the report with what really happened and tell the user how close it was. Prefer a change announced after the model's training cutoff, so the model cannot remember the outcome.

READING THE RESULT
- headline and stats are computed in code. Quote them as they are.
- headline gives the median across samples with the range in brackets. Always pass the range on with the number: ensemble.leaveShare has median, min and max.
- Say basis.confidence (low, medium, high) next to any number you report, with its reason.
- With segments, lead with ensemble.netMrrChange when present, then ensemble.customersAtRisk and ensemble.mrrAtRisk (median and range). Compare each segment's leaveShare with its breakEvenLeaveShare. Downgrades are not in the revenue figures: say so and name the segment with the highest leaveShare in stats.segments. A segment with a null leaveShare had no persona: say so.
- Cite quotes by their url. Never paraphrase a quote as if it were one.
- It is a simulation. Never present it as a forecast or a measured result. recommendations are hypotheses.

ERRORS (error.code, CLI exit code)
- USAGE (2): fix the named argument.
- PROVIDER_UNAVAILABLE (3): run doctor, pick another llm.
- BUDGET_EXCEEDED (4): lower personas, rounds or samples, or raise maxCalls.
- INSUFFICIENT_EVIDENCE (5): add urls or evidencePaths, set BRIGHTDATA_API_KEY, or retry with allowUngrounded true and tell the user the personas are model-written.
- LLM_INVALID_OUTPUT (6): retry with a stronger model or fewer personas.
- GROUND_FAILED (7): check BRIGHTDATA_API_KEY and zone names.
- NOT_FOUND (8): list runs with greenroom_runs.
A failed run keeps its finished stages. Resume it with the CLI: greenroom run --resume <runId>.`;
