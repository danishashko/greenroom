export type ErrorCode =
  | "USAGE"
  | "PROVIDER_UNAVAILABLE"
  | "BUDGET_EXCEEDED"
  | "INSUFFICIENT_EVIDENCE"
  | "LLM_INVALID_OUTPUT"
  | "GROUND_FAILED"
  | "NOT_FOUND"
  | "INTERNAL";

/** Stable exit codes so scripts and agents can branch without parsing text. */
export const EXIT_CODES: Record<ErrorCode, number> = {
  INTERNAL: 1,
  USAGE: 2,
  PROVIDER_UNAVAILABLE: 3,
  BUDGET_EXCEEDED: 4,
  INSUFFICIENT_EVIDENCE: 5,
  LLM_INVALID_OUTPUT: 6,
  GROUND_FAILED: 7,
  NOT_FOUND: 8,
};

export class GreenroomError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "GreenroomError";
  }
  toJSON() {
    return { code: this.code, message: this.message, hint: this.hint, exitCode: EXIT_CODES[this.code] };
  }
}

export function toGreenroomError(e: unknown): GreenroomError {
  if (e instanceof GreenroomError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new GreenroomError("INTERNAL", msg);
}
