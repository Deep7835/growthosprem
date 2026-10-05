// Models and metering for the AI Copilot (PRD 6.14, 9).

/** Copilot chat, strategy and analysis. */
export const COPILOT_MODEL = "claude-opus-5-5";
/** Inline caption, hook and hashtag help: the PRD's cheaper model for high-volume writing (PRD 9). */
export const WRITING_MODEL = "claude-sonnet-5-5";

/** Reasoning levels in the prompt box (AI-03), mapped to effort. */
export const REASONING = {
  standard: { label: "Standard", effort: "low" },
  balanced: { label: "Balanced", effort: "medium" },
  high: { label: "High", effort: "high" },
  advanced: { label: "Advanced", effort: "xhigh" },
} as const;
export type ReasoningLevel = keyof typeof REASONING;

// US$ per million tokens. Cache writes (5-minute) cost 1.25x input.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
};

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** 1 credit = US$0.01 of model usage, rounded up, at least 1 per call. */
export function creditsFor(model: string, usage: TokenUsage): number {
  const p = PRICES[model] ?? PRICES[COPILOT_MODEL];
  const cost =
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * p.input * 1.25) /
    1_000_000;
  return Math.max(1, Math.ceil(cost * 100));
}
