import { NextResponse } from 'next/server';
import { errorResponse, newRequestId } from '@/lib/api/errors';
import { requireAdmin } from '@/lib/api/auth';
import { adminReadiness } from '@/lib/firebase/admin';
import { providerStatus, serverEnv } from '@/lib/env';
import { groqConfigured, listAvailableModels } from '@/lib/groq/client';
import { PLANS } from '@/lib/plans';
import { logServerError } from '@/lib/server/errors-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Provider configuration status for administrators.
 * Only booleans and non-secret identifiers are returned — never key values.
 */
export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const verify = url.searchParams.get('verify') === '1';

    const status = providerStatus();
    let models: { available: string[]; textModelPresent: boolean | null; whisperModelPresent: boolean | null } | null = null;

    if (verify) {
      if (groqConfigured()) {
        const available = await listAvailableModels();
        models = {
          available: available.slice(0, 40),
          textModelPresent: available.includes(serverEnv.groqTextModel),
          whisperModelPresent: available.includes(serverEnv.groqWhisperModel),
        };
      } else {
        models = { available: [], textModelPresent: null, whisperModelPresent: null };
      }
    }

    return NextResponse.json(
      {
        providers: status,
        infrastructure: {
          firebaseAdmin: adminReadiness(),
          appCheckEnforced: (process.env.APP_CHECK_ENFORCE || 'false') === 'true',
        },
        configurationChecklist: [
          { key: 'GROQ_API_KEY', required: true, present: Boolean(serverEnv.groqApiKey), scope: 'server' },
          { key: 'GROQ_TEXT_MODEL', required: false, present: true, scope: 'server', value: serverEnv.groqTextModel },
          { key: 'GROQ_WHISPER_MODEL', required: false, present: true, scope: 'server', value: serverEnv.groqWhisperModel },
          { key: 'FIREBASE_SERVICE_ACCOUNT_KEY', required: true, present: adminReadiness() === 'ready', scope: 'server' },
          { key: 'TWILIO_ACCOUNT_SID', required: false, present: Boolean(serverEnv.twilioAccountSid), scope: 'server' },
          { key: 'TWILIO_AUTH_TOKEN', required: false, present: Boolean(serverEnv.twilioAuthToken), scope: 'server' },
          { key: 'TWILIO_PHONE_NUMBER', required: false, present: Boolean(serverEnv.twilioPhoneNumber), scope: 'server' },
          { key: 'TWILIO_WEBHOOK_BASE_URL', required: false, present: Boolean(serverEnv.twilioWebhookBaseUrl), scope: 'server' },
          { key: 'TELEPHONY_CALLING_ENABLED', required: false, present: serverEnv.telephonyCallingEnabled, scope: 'server' },
          { key: 'VOICE_STREAM_URL', required: false, present: Boolean(process.env.VOICE_STREAM_URL), scope: 'server' },
          { key: 'NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY', required: false, present: Boolean(process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY), scope: 'public' },
        ],
        planLimits: PLANS.map((plan) => ({ id: plan.id, name: plan.name, limits: plan.limits })),
        models,
        requestId,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await logServerError({ scope: 'admin:providers', error, requestId });
    return errorResponse(error, requestId);
  }
}
