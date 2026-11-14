---
name: greenroom
description: Rehearse a product launch, pricing change, plan change or repositioning against simulated buyers built from real quotes, before shipping it. Use when someone asks how customers will react to a price increase, a free tier removal, a new plan, a rename or a launch, or wants to backtest how a past change would have been received.
---

# greenroom

Run it through the MCP server (`greenroom_*` tools) if it is connected, otherwise through the CLI with `--json`.

1. Print the full operating guide first and follow it:

   ```bash
   npx -y greenroom guide
   ```

2. Check backends and cost before spending anything:

   ```bash
   npx -y greenroom doctor --json
   npx -y greenroom estimate "<change>" --json
   ```

3. Run, then read the summary:

   ```bash
   npx -y greenroom run "<change>" --audience "<who buys it>" --json
   ```

Rules that matter most:
- Report the median with its range and the confidence level, never a single bare number.
- Cite quotes by URL. It is a simulation, not a forecast.
- A default run takes about 7 minutes. Use `--samples 1` for a quick look.
