import { GreenroomError } from "./errors.js";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** List-price equivalent in USD, when the provider reports it. */
  listPriceUsd?: number;
}

/** Counts calls and tokens for one run and enforces the call cap before spend. */
export class Meter {
  calls = 0;
  inputTokens = 0;
  outputTokens = 0;
  listPriceUsd = 0;
  sawPrice = false;
  readonly byLabel = new Map<string, number>();

  constructor(public readonly maxCalls: number) {}

  /** Throws before a call that would pass the cap. */
  reserve(label: string): void {
    if (this.calls >= this.maxCalls) {
      throw new GreenroomError(
        "BUDGET_EXCEEDED",
        `Call cap of ${this.maxCalls} reached before "${label}".`,
        "Raise --max-calls, lower --personas or --rounds, or run `greenroom estimate` first.",
      );
    }
    this.calls++;
    this.byLabel.set(label, (this.byLabel.get(label) ?? 0) + 1);
  }

  add(u: Usage): void {
    this.inputTokens += u.inputTokens;
    this.outputTokens += u.outputTokens;
    if (u.listPriceUsd !== undefined) {
      this.listPriceUsd += u.listPriceUsd;
      this.sawPrice = true;
    }
  }

  snapshot() {
    return {
      calls: this.calls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      listPriceUsd: this.sawPrice ? Math.round(this.listPriceUsd * 10000) / 10000 : null,
    };
  }
}
