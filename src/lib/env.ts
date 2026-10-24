/**
 * Server-side environment access. Import only from server code (route handlers,
 * server components). The server-only boundary makes accidental imports from
 * client components a build error. Missing values do not crash the build —
 * call sites surface actionable configuration errors instead.
 */

import 'server-only';

import { appCheckSiteKey, firebaseWebConfig } from '@/lib/firebase/config';

export { appCheckSiteKey, firebaseWebConfig };

export const serverEnv = {
  projectId: process.env.FIREBASE_PROJECT_ID || firebaseWebConfig.projectId,
  serviceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '',
  serviceAccountFile: process.env.FIREBASE_SERVICE_ACCOUNT_FILE || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqBaseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
  // Chat model. Groq shut down llama-3.1-8b-instant and llama-3.3-70b-versatile
  // for free/developer tiers on 2026-08-16; gpt-oss-120b is the current
  // production replacement recommended by Groq. Override via GROQ_TEXT_MODEL.
  groqTextModel: process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
  groqWhisperModel: process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  twilioWebhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || '',
  telephonyCallingEnabled: (process.env.TELEPHONY_CALLING_ENABLED || 'false') === 'true',
  rateLimitTranscribePerHour: positiveInt(process.env.RATE_LIMIT_TRANSCRIBE_PER_HOUR, 30),
  rateLimitChatPerHour: positiveInt(process.env.RATE_LIMIT_CHAT_PER_HOUR, 120),
};

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Non-secret provider readiness, safe to return from `/api/status`. */
export function providerStatus() {
  const telephonyConfigured = Boolean(
    serverEnv.twilioAccountSid && serverEnv.twilioAuthToken && serverEnv.twilioPhoneNumber,
  );
  return {
    groq: {
      configured: Boolean(serverEnv.groqApiKey),
      textModel: serverEnv.groqTextModel,
      whisperModel: serverEnv.groqWhisperModel,
      baseUrl: serverEnv.groqBaseUrl,
    },
    telephony: {
      provider: 'twilio' as const,
      configured: telephonyConfigured,
      callingEnabled: telephonyConfigured && serverEnv.telephonyCallingEnabled,
      webhookBaseUrlConfigured: Boolean(serverEnv.twilioWebhookBaseUrl),
      phoneNumber: serverEnv.twilioPhoneNumber || null,
    },
    appCheck: { configured: Boolean(appCheckSiteKey) },
  };
}
