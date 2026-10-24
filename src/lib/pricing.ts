/**
 * Provider pricing used for usage cost ESTIMATES only.
 *
 * Verified against console.groq.com/docs/models on 2026-10-24.
 * Groq bills a minimum of 10 seconds of audio per transcription request, and
 * the retired Llama models are enterprise-only, so they are not listed here.
 * Update these numbers when Groq changes pricing; they are not billing figures.
 */
export const GROQ_PRICING = {
  // USD per audio hour
  whisperLargeV3TurboPerHour: 0.04,
  whisperLargeV3PerHour: 0.111,
  // USD per 1M tokens (Groq production catalogue)
  textModels: {
    'openai/gpt-oss-120b': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    'openai/gpt-oss-20b': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
    'openai/gpt-oss-safeguard-20b': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
    'qwen/qwen3.8-27b': { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  } as Record<string, { inputPerMillion: number; outputPerMillion: number }>,
} as const;

export const MINIMUM_BILLED_AUDIO_SECONDS = 10;

export function estimateTranscriptionCostUsd(model: string, audioSeconds: number): number {
  const perHour = model.includes('turbo')
    ? GROQ_PRICING.whisperLargeV3TurboPerHour
    : GROQ_PRICING.whisperLargeV3PerHour;
  const billedSeconds = Math.max(audioSeconds, MINIMUM_BILLED_AUDIO_SECONDS);
  return round6((billedSeconds / 3600) * perHour);
}

export function estimateChatCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = GROQ_PRICING.textModels[model];
  if (!pricing) return 0;
  return round6((inputTokens / 1_000_000) * pricing.inputPerMillion + (outputTokens / 1_000_000) * pricing.outputPerMillion);
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
