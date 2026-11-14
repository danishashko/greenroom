# greenroom

Rehearse a launch, pricing change or repositioning against simulated buyers built from real conversations.

```bash
npx greenroom run "Raise Pro from $49 to $79 per month" --audience "B2B marketing teams"
```

You get a report with the share of buyers who react badly, who would leave, the objections behind it with real quotes, and the changes that would soften it. Every persona is built from quotes pulled from Reddit, Hacker News, review sites and forums. Quotes that do not appear verbatim on the source page are thrown away.

## Pick your own backend

No API key is required if you already pay for Claude.

| Backend | Flag | Needs |
| --- | --- | --- |
| Claude subscription | `--llm claude-cli` | [Claude Code](https://claude.com/claude-code) installed and logged in |
| Anthropic API | `--llm anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | `--llm openai` | `OPENAI_API_KEY` |
| OpenRouter | `--llm openrouter` | `OPENROUTER_API_KEY` |
| Ollama or LM Studio | `--llm ollama` / `lmstudio` | local server |
| Any OpenAI-format endpoint | `--llm openai-compatible` | `LLM_BASE_URL`, `GREENROOM_MODEL_FAST` |
| Codex CLI, Gemini CLI | `--llm codex-cli` / `gemini-cli` | experimental |

Leave `--llm` out and greenroom picks the first one that works. Run `greenroom doctor` to see what is available.

`claude-cli` runs your own `claude` binary. greenroom never reads or stores your login. Each call is isolated (no tools, no MCP servers, no skills, no CLAUDE.md), because a default Claude Code call can load hundreds of thousands of tokens of personal context. An isolated call used about 1,400 input tokens in testing.

## Where the quotes come from

| Grounding | Flag | Notes |
| --- | --- | --- |
| [Bright Data](https://brightdata.com) | `--ground brightdata` | SERP API finds the threads, Web Unlocker reads pages that block ordinary requests. Set `BRIGHTDATA_API_KEY`. Optional `BRIGHTDATA_SERP_ZONE`, `BRIGHTDATA_UNLOCKER_ZONE`. |
| Plain fetch | `--ground local` | No search. Pass pages with `--urls` or files with `--evidence`. Sites that block bots will fail. |
| Off | `--ground none` | Evidence files only. |

Bring your own quotes with `--evidence ./quotes.json` (an array of strings or `{quote, url}` objects) or a folder of `.txt` and `.md` files.

## How it works

1. **Ground.** Search for real discussions, read the pages, extract verbatim quotes, drop anything reworded, strip emails and phone numbers.
2. **Personas.** Build buyer personas from the quotes. Each must cite quotes that exist. Audience share is computed from how many quotes back each persona.
3. **Simulate.** Each persona reacts alone, then sees a digest of what the others said and decides again.
4. **Repeat.** Steps 2 and 3 run as independent samples (3 by default, `--samples`) on the same evidence. One run is noisy, so the report gives the median and the range, and confidence drops when samples disagree by more than 25 points.
5. **Report.** All percentages are computed in code from the final round. The model groups objections and writes the readout and recommendations.

Outputs per run in `.greenroom/runs/<id>/`: `report.html`, `report.md`, `report.json`, plus the stage files. Each simulation round is saved as it finishes, so a failed run resumes from the last finished round with `greenroom run --resume <id>`. Rate limits, timeouts and dropped connections are retried before anything fails.

## Backtest a change that already happened

```bash
greenroom run "Heroku ends all free plans on November 28, 2022" --as-of 2022-08-24
```

`--as-of` limits search to pages published by that date, drops quotes dated later, and tells every persona that today is that day. Compare the report with what really happened before you trust a run on a change that has not happened yet. The model may still remember the real outcome, and the report says so.

## CLI

```bash
greenroom run "<change>" [--kind pricing] [--product Acme] [--audience "..."] [--competitor A B]
greenroom estimate "<change>"      # calls, tokens, time. Spends nothing.
greenroom doctor [--deep]          # which backends work here
greenroom runs                     # saved runs
greenroom show <runId> --format md|json|html|path
greenroom schema report|seed       # JSON Schema
greenroom mcp                      # MCP server on stdio
```

Add `--json` to any command for one JSON document on stdout. Progress goes to stderr. `--events` streams progress as NDJSON.

Exit codes: `0` ok, `2` usage, `3` backend unavailable, `4` call cap hit, `5` not enough evidence, `6` invalid model output, `7` grounding failed, `8` not found.

## MCP

```bash
claude mcp add greenroom -- npx -y greenroom mcp
```

```json
{ "mcpServers": { "greenroom": { "command": "npx", "args": ["-y", "greenroom", "mcp"] } } }
```

Tools: `greenroom_doctor`, `greenroom_estimate`, `greenroom_start`, `greenroom_status`, `greenroom_report`, `greenroom_runs`. Runs take minutes, so `greenroom_start` returns a job id and `greenroom_status` can wait up to 55 seconds per call. Every tool has an output schema and read/write annotations. See [AGENTS.md](AGENTS.md).

## Library

```ts
import { runRehearsal } from "greenroom";

const { report } = await runRehearsal({
  seed: { change: "Raise Pro from $49 to $79 per month", kind: "pricing" },
  llm: "claude-cli",
  ground: "brightdata",
});
console.log(report.headline);
```

## Limits

- Output is a simulation. It shows which objections and segments are likely to matter, not a measured conversion change.
- Confidence is `low` below 12 quotes or 3 domains, and for any run without evidence. Read the Basis section of the report.
- Personas share the biases of the model that plays them.
- Run it on a change that already happened and compare before you trust it on one that has not.

## Development

```bash
npm install
npm test
npm run build
node scripts/mcp-smoke.mjs --run   # drives the MCP server like an agent
```

MIT
