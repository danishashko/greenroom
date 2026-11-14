# AGENTS.md

How to operate greenroom as an agent. Prefer the MCP tools. The CLI behaves the same.

## Workflow

1. `greenroom_doctor` (CLI: `greenroom doctor --json`). Read `recommendedLlm`. Pass it as `llm` or omit `llm` to auto-detect.
2. `greenroom_estimate`. Check `estimate.calls.total` and `estimate.cost`. On a paid API backend, confirm with the user when `cost.usd` is above their comfort or unknown.
3. `greenroom_start`. Returns `jobId` at once. A full run takes 3 to 15 minutes.
4. `greenroom_status` with `waitSeconds: 55` until `status` is `complete` or `failed`. Do not poll faster than that.
5. `greenroom_report` with `format: "summary"`. Ask for `full` only when you need a persona, reaction or quote.

## Writing a good seed

- `change` is one concrete sentence with numbers and dates: "Raise Pro from $49 to $79 per month for new and existing customers from January 1".
- Set `kind`, `productName`, `audience` and `competitors` when known. Vague audiences give vague personas.
- Pass `productUrl` so personas know the real product.
- Do not put the expected outcome in `change` or `context`.
- To backtest a past change, set `asOf` to the day before it was announced. Then compare the report with the real outcome and tell the user how close it was.

## Reading the result

- `headline` and `stats` are computed in code. Quote them as they are.
- `headline` uses the median across samples with the range in brackets. `ensemble.leaveShare` has `median`, `min`, `max`. Pass the range on with the number. `stats`, `personas` and `reactions` are from the sample closest to the median (`ensemble.shownSample`).
- `samples: 1` is fine for a quick look, but its confidence reason says the spread is unknown. Use the default 3 before anyone acts on the result.
- `basis.confidence` is `low`, `medium` or `high`. Say it next to any number you pass on. `low` means thin evidence.
- Every quote carries an `evidenceId` and a `url`. Cite those, not paraphrases.
- This is a simulation. Never report it as a forecast or a measured result.
- `recommendations` are model-written. Treat them as hypotheses.

## Errors

CLI with `--json` prints `{ "ok": false, "error": { "code", "message", "hint", "exitCode" } }`. MCP tools return the same object with `isError: true`.

| code | exit | what to do |
| --- | --- | --- |
| `USAGE` | 2 | Fix the arguments. The message names the field. |
| `PROVIDER_UNAVAILABLE` | 3 | Run doctor. Pick another `llm`. |
| `BUDGET_EXCEEDED` | 4 | Lower `personas` or `rounds`, or raise `maxCalls`. |
| `INSUFFICIENT_EVIDENCE` | 5 | Add `urls` or `evidencePaths`, set `BRIGHTDATA_API_KEY`, or retry with `allowUngrounded: true` and say so to the user. |
| `LLM_INVALID_OUTPUT` | 6 | Retry with a stronger `--model-strong` or fewer personas. |
| `GROUND_FAILED` | 7 | Check `BRIGHTDATA_API_KEY` and zone names. |
| `NOT_FOUND` | 8 | Check the run id with `greenroom_runs`. |

## Rules for this repo

- All statistics are computed in `src/pipeline/report.ts`. The model never writes a number that ends up in `stats` or `headline`.
- Quotes are kept only if they appear verbatim in the fetched page (`quoteIsVerbatim`). Do not loosen this.
- `claude-cli` must never use `--bare` (it disables subscription login) and must keep the isolation flags in `buildClaudeArgs`. A test enforces both.
- Report styling follows the Bright Data design guidelines: navy canvas, blue as the single accent, pink sparing, pill buttons, motion under 320 ms. Tokens are in `src/render/html.ts`.
- No emoji in UI or docs.
- Run `npm test` and `npm run typecheck` before finishing.
