import type { GroundProvider } from "../ground/types.js";
import type { LlmProvider } from "../llm/types.js";
import type { Meter } from "../meter.js";
import type { Seed } from "../schema.js";

export interface RunEvent {
  at: string;
  stage: "setup" | "ground" | "personas" | "simulate" | "report" | "done";
  level: "info" | "warn";
  message: string;
  data?: Record<string, unknown>;
}

export interface GroundOptions {
  urls: string[];
  evidencePaths: string[];
  maxQueries: number;
  maxPages: number;
  country?: string;
}

export interface Ctx {
  seed: Seed;
  llm: LlmProvider;
  ground: GroundProvider | null;
  meter: Meter;
  emit: (e: Omit<RunEvent, "at">) => void;
  groundOptions: GroundOptions;
  personaCount: number;
  rounds: number;
  allowUngrounded: boolean;
}
