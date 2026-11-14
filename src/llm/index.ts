import { spawnSync } from "node:child_process";
import { GreenroomError } from "../errors.js";
import type { Meter } from "../meter.js";
import { AnthropicApiProvider } from "./anthropic.js";
import { ClaudeCliProvider } from "./claude-cli.js";
import { CliTextProvider } from "./cli-text.js";
import { OpenAiCompatProvider } from "./openai-compat.js";
import type { LlmProvider } from "./types.js";

export interface ProviderInfo {
  id: string;
  label: string;
  kind: "subscription" | "api" | "local";
  needs: string;
  experimental?: boolean;
}

/** Everything the user can pick with --llm. Stable, machine-readable. */
export const PROVIDERS: ProviderInfo[] = [
  { id: "claude-cli", label: "Claude Code CLI, uses your Claude subscription", kind: "subscription", needs: "`claude` installed and logged in" },
  { id: "anthropic", label: "Anthropic API", kind: "api", needs: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI API", kind: "api", needs: "OPENAI_API_KEY" },
  { id: "openrouter", label: "OpenRouter", kind: "api", needs: "OPENROUTER_API_KEY" },
  { id: "ollama", label: "Ollama, local", kind: "local", needs: "Ollama running on :11434" },
  { id: "lmstudio", label: "LM Studio, local", kind: "local", needs: "LM Studio server on :1234" },
  { id: "openai-compatible", label: "Any OpenAI-format endpoint", kind: "api", needs: "LLM_BASE_URL, LLM_API_KEY, GREENROOM_MODEL_FAST" },
  { id: "codex-cli", label: "Codex CLI, uses your ChatGPT plan", kind: "subscription", needs: "`codex` installed and logged in", experimental: true },
  { id: "gemini-cli", label: "Gemini CLI, uses your Google login", kind: "subscription", needs: "`gemini` installed and logged in", experimental: true },
];

function onPath(bin: string): boolean {
  const probe = process.platform === "win32" ? "where" : "which";
  return spawnSync(probe, [bin], { stdio: "ignore" }).status === 0;
}

export interface ResolveOptions {
  id?: string;
  meter: Meter;
  models?: { fast?: string; strong?: string };
}

export function createProvider(id: string, o: Omit<ResolveOptions, "id">): LlmProvider {
  const base = { meter: o.meter, models: o.models };
  const env = process.env;
  switch (id) {
    case "claude-cli":
      return new ClaudeCliProvider(base);
    case "anthropic": {
      if (!env["ANTHROPIC_API_KEY"]) throw new GreenroomError("PROVIDER_UNAVAILABLE", "ANTHROPIC_API_KEY is not set.", "Export it, or use --llm claude-cli to run on your subscription.");
      return new AnthropicApiProvider(env["ANTHROPIC_API_KEY"], base);
    }
    case "openai": {
      if (!env["OPENAI_API_KEY"]) throw new GreenroomError("PROVIDER_UNAVAILABLE", "OPENAI_API_KEY is not set.");
      return new OpenAiCompatProvider({ ...base, id, label: "OpenAI API", kind: "api", baseUrl: "https://api.openai.com/v1", apiKey: env["OPENAI_API_KEY"], defaultModels: { fast: "gpt-5-mini", strong: "gpt-5" } });
    }
    case "openrouter": {
      if (!env["OPENROUTER_API_KEY"]) throw new GreenroomError("PROVIDER_UNAVAILABLE", "OPENROUTER_API_KEY is not set.");
      return new OpenAiCompatProvider({ ...base, id, label: "OpenRouter", kind: "api", baseUrl: "https://openrouter.ai/api/v1", apiKey: env["OPENROUTER_API_KEY"], defaultModels: { fast: "anthropic/claude-sonnet-5-5", strong: "anthropic/claude-opus-5-5" } });
    }
    case "ollama":
      return new OpenAiCompatProvider({ ...base, id, label: "Ollama", kind: "local", baseUrl: env["OLLAMA_HOST"] ? `${env["OLLAMA_HOST"].replace(/\/$/, "")}/v1` : "http://localhost:11434/v1", defaultModels: { fast: env["GREENROOM_MODEL_FAST"] ?? "llama3.1", strong: env["GREENROOM_MODEL_STRONG"] ?? env["GREENROOM_MODEL_FAST"] ?? "llama3.1" } });
    case "lmstudio":
      return new OpenAiCompatProvider({ ...base, id, label: "LM Studio", kind: "local", baseUrl: "http://localhost:1234/v1", defaultModels: { fast: env["GREENROOM_MODEL_FAST"] ?? "local-model", strong: env["GREENROOM_MODEL_STRONG"] ?? env["GREENROOM_MODEL_FAST"] ?? "local-model" } });
    case "openai-compatible": {
      if (!env["LLM_BASE_URL"]) throw new GreenroomError("PROVIDER_UNAVAILABLE", "LLM_BASE_URL is not set.", "Example: LLM_BASE_URL=https://api.groq.com/openai/v1");
      const m = env["GREENROOM_MODEL_FAST"];
      if (!m) throw new GreenroomError("PROVIDER_UNAVAILABLE", "GREENROOM_MODEL_FAST is not set.", "Set the model name your endpoint serves.");
      return new OpenAiCompatProvider({ ...base, id, label: "OpenAI-compatible endpoint", kind: "api", baseUrl: env["LLM_BASE_URL"], apiKey: env["LLM_API_KEY"], defaultModels: { fast: m, strong: env["GREENROOM_MODEL_STRONG"] ?? m } });
    }
    case "codex-cli":
      return new CliTextProvider({ ...base, id, label: "Codex CLI", bin: "codex", args: ["exec", "--skip-git-repo-check", "-"], modelFlag: "--model" });
    case "gemini-cli":
      return new CliTextProvider({ ...base, id, label: "Gemini CLI", bin: "gemini", args: [], modelFlag: "--model" });
    default:
      throw new GreenroomError("USAGE", `Unknown LLM provider "${id}".`, `Choose one of: ${PROVIDERS.map((p) => p.id).join(", ")}.`);
  }
}

/** Auto-detect order: subscription first, then keys, then local. Explicit --llm or GREENROOM_LLM wins. */
export function resolveProvider(o: ResolveOptions): LlmProvider {
  const wanted = o.id ?? process.env["GREENROOM_LLM"];
  if (wanted && wanted !== "auto") return createProvider(wanted, o);
  if (onPath("claude")) return createProvider("claude-cli", o);
  if (process.env["ANTHROPIC_API_KEY"]) return createProvider("anthropic", o);
  if (process.env["OPENAI_API_KEY"]) return createProvider("openai", o);
  if (process.env["OPENROUTER_API_KEY"]) return createProvider("openrouter", o);
  if (process.env["LLM_BASE_URL"]) return createProvider("openai-compatible", o);
  throw new GreenroomError(
    "PROVIDER_UNAVAILABLE",
    "No LLM backend found.",
    "Install and log in to Claude Code, or set ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY, or start Ollama and pass --llm ollama.",
  );
}

export type { LlmProvider } from "./types.js";
