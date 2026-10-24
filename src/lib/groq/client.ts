import { MAX_AUDIO_BYTES } from '@/lib/audio-limits';
import { serverEnv } from '@/lib/env';
import { apiErrors } from '@/lib/api/errors';

/**
 * Groq server client.
 *
 * All calls happen server-side only. The API key is read from `GROQ_API_KEY`
 * and is never included in a response, log line or error message.
 */

export const AUDIO_LIMITS = {
  /** Leave room for multipart overhead beneath Vercel's 4.5 MB request limit. */
  maxBytes: MAX_AUDIO_BYTES,
  minBytes: 1024,
  allowedMimeTypes: [
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/flac',
    'audio/x-flac',
    'video/mp4', // some browsers label m4a recordings this way
    'video/webm',
    'application/octet-stream', // Safari sometimes omits a usable MIME type
  ],
  allowedExtensions: [
    '.mp3', '.mp4', '.m4a', '.wav', '.webm', '.ogg', '.oga', '.flac', '.mpeg', '.mpga', '.opus',
  ],
  extractTimeoutMs: 90_000,
};

export function groqConfigured(): boolean {
  return Boolean(serverEnv.groqApiKey);
}

function requireKey(): string {
  if (!groqConfigured()) {
    throw apiErrors.providerNotConfigured(
      'Speech and AI providers are not configured on this deployment.',
      'Add GROQ_API_KEY to the server environment (server-only, never NEXT_PUBLIC_).',
    );
  }
  return serverEnv.groqApiKey;
}

interface GroqErrorPayload {
  error?: { message?: string; type?: string; code?: string };
}

function mapGroqFailure(status: number, payload: GroqErrorPayload | null, retryAfter: string | null) {
  const message = payload?.error?.message || '';
  if (status === 401 || status === 403) {
    return apiErrors.providerNotConfigured(
      'The AI provider rejected this deployment\'s credentials.',
      'Check that GROQ_API_KEY is valid and has not been revoked.',
    );
  }
  if (status === 429) {
    const seconds = Number(retryAfter) || 20;
    return apiErrors.rateLimited(seconds, 'The AI provider is rate limiting requests. Try again shortly.');
  }
  if (status === 413) {
    return apiErrors.providerError('The audio file is too large for the provider.');
  }
  if (status >= 500) {
    return apiErrors.providerError('The AI provider is temporarily unavailable. Try again.');
  }
  if (status === 400 && /model/i.test(message)) {
    return apiErrors.providerError(
      'The configured model is not available. An administrator needs to update the server model setting.',
    );
  }
  return apiErrors.providerError('The AI provider rejected the request.', {
    status,
    reason: message.slice(0, 300) || undefined,
  });
}

export interface TranscriptionResult {
  text: string;
  language: string | null;
  durationSeconds: number;
  model: string;
}

/**
 * Speech-to-text via Groq Whisper. Audio is streamed to Groq and never written
 * to disk — nothing is retained after the request completes.
 */
export async function transcribeAudio(input: {
  data: ArrayBuffer;
  mimeType: string;
  filename: string;
  language?: string;
}): Promise<TranscriptionResult> {
  const key = requireKey();
  const model = serverEnv.groqWhisperModel;

  const form = new FormData();
  const blob = new Blob([input.data], { type: input.mimeType || 'application/octet-stream' });
  form.append('file', blob, input.filename);
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (input.language && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(input.language)) {
    form.append('language', input.language.split('-')[0]);
  }

  let response: Response;
  try {
    response = await fetch(`${serverEnv.groqBaseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(AUDIO_LIMITS.extractTimeoutMs),
    });
  } catch (error) {
    if ((error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError') {
      throw apiErrors.providerError('Transcription timed out. Try a shorter recording.');
    }
    throw apiErrors.providerError('Could not reach the transcription service.');
  }

  if (!response.ok) {
    let payload: GroqErrorPayload | null = null;
    try {
      payload = (await response.json()) as GroqErrorPayload;
    } catch {
      payload = null;
    }
    // Log status only — never the request body or credentials.
    console.warn('[groq:transcribe] provider rejected', { status: response.status });
    throw mapGroqFailure(response.status, payload, response.headers.get('retry-after'));
  }

  const json = (await response.json()) as {
    text?: string;
    language?: string;
    duration?: number;
  };

  const text = (json.text || '').trim();
  return {
    text,
    language: json.language || null,
    // Groq returns duration in seconds for verbose_json responses.
    durationSeconds: Number.isFinite(json.duration) ? Number(json.duration) : 0,
    model,
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export async function generateChatCompletion(options: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ChatCompletionResult> {
  const key = requireKey();
  const model = options.model || serverEnv.groqTextModel;

  let response: Response;
  try {
    response = await fetch(`${serverEnv.groqBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 350,
        top_p: 0.9,
        stream: false,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch (error) {
    if ((error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError') {
      throw apiErrors.providerError('The AI model took too long to respond. Try again.');
    }
    throw apiErrors.providerError('Could not reach the AI service.');
  }

  if (!response.ok) {
    let payload: GroqErrorPayload | null = null;
    try {
      payload = (await response.json()) as GroqErrorPayload;
    } catch {
      payload = null;
    }
    console.warn('[groq:chat] provider rejected', { status: response.status });
    throw mapGroqFailure(response.status, payload, response.headers.get('retry-after'));
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    model?: string;
  };

  const content = json.choices?.[0]?.message?.content?.trim() || '';
  if (!content) throw apiErrors.providerError('The AI model returned an empty response.');

  return {
    content,
    model: json.model || model,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
    totalTokens: json.usage?.total_tokens ?? 0,
  };
}

/** Used by the admin provider-status panel to confirm configured models exist. */
export async function listAvailableModels(): Promise<string[]> {
  const key = requireKey();
  try {
    const response = await fetch(`${serverEnv.groqBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { data?: Array<{ id?: string }> };
    return (json.data || []).map((m) => m.id).filter((id): id is string => Boolean(id)).sort();
  } catch {
    return [];
  }
}
