# AGENTS.md

For coding agents working on this repo.

To **use** greenroom rather than change it, run `npx greenroom-cli guide`. It prints the operating guide (workflow, seed writing, how to report results, error codes). It is the same text the MCP server sends as its instructions. The source is `src/guide.ts`.

## Map

| Path | What it does |
| --- | --- |
| `src/engine.ts` | Runs the stages, checkpoints, resume, samples, usage totals |
| `src/pipeline/ground.ts` | Search, page reading, quote extraction and verbatim check, cut-off filter |
| `src/ground/customers.ts` | Customer data import: CSV/JSON/JSONL parsing, column detection, segment-spread sampling |
| `src/ground/clean.ts` | Strips page noise and keeps the paragraphs most likely to hold opinions |
| `src/ground/brightdata.ts` | Bright Data SERP and Web Unlocker, retries, Google redirect unwrapping |
| `src/pipeline/personas.ts` | Personas from quotes, weights from evidence share, or anchored to seed segment counts |
| `src/pipeline/simulate.ts` | Rounds, per-round checkpoints |
| `src/pipeline/report.ts` | Stats, per-segment results, customers and revenue at risk, ensemble ranges, confidence, themes, verdict |
| `src/llm/*` | Backends. `claude-cli.ts` is the subscription path |
| `src/prompts.ts` | Every prompt |
| `src/render/*` | HTML and markdown reports |
| `src/cli.ts`, `src/mcp.ts` | The two interfaces. Keep them in step |
| `src/guide.ts` | Agent operating guide, served by MCP and `greenroom guide` |

## Invariants

- Every number in `stats`, `ensemble` and `headline` is computed in `src/pipeline/report.ts`. The model never writes one.
- Quotes are kept only if they appear verbatim in the text the model was shown (`verbatimChecker`). Do not loosen this.
- `claude-cli` never uses `--bare` (it disables subscription login) and keeps the isolation flags in `buildClaudeArgs`. A test enforces both.
- No API key is ever written to the repo, fixtures or test output.
- A resume keeps the saved personas and rounds. Only samples can grow.
- Report styling follows the Bright Data design guidelines: navy canvas, blue as the single accent, pink sparing, pill buttons, motion under 320 ms. Tokens are in `src/render/html.ts`.
- No emoji in UI, output or docs.

## When you change behavior

- A new option goes in the CLI, the MCP input schema, `src/guide.ts` and the README together.
- A report field change bumps `REPORT_SCHEMA_VERSION` in `src/schema.ts`.
- New time or cost figures in `src/guide.ts` and the README come from a real run, not from the estimate.

## Before you finish

```bash
npm run typecheck
npm test
npm run build && node scripts/mcp-smoke.mjs
```

For a change to grounding, prompts or the `claude-cli` backend, also run one live rehearsal with `--samples 1` and read the report.
