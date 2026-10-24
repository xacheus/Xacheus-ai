import { NextResponse } from 'next/server';
import { getAdminDb, hasAdminCredentials } from '@/lib/firebase/admin';
import {
  buildVoiceTwiml,
  resolveWebhookUrl,
  telephonyConfigured,
  validateTwilioSignature,
  xmlResponse,
} from '@/lib/telephony/twilio';
import { serializeAgent } from '@/lib/server/repository';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Twilio voice webhook (TwiML).
 *
 * Requires a valid Twilio signature. Returns a media stream only when a
 * bidirectional voice gateway is configured; otherwise it clearly states that
 * calling is not yet available. Inbound routing needs a number→workspace map,
 * which is intentionally not guessed here.
 */
export async function POST(request: Request) {
  if (!telephonyConfigured()) {
    return NextResponse.json({ error: 'Telephony is not configured.' }, { status: 503 });
  }

  const url = resolveWebhookUrl(request, serverEnv.twilioWebhookBaseUrl, '/api/telephony/twilio/voice');

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });

  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value;
  });

  const signature = request.headers.get('x-twilio-signature') || '';
  if (!validateTwilioSignature({ authToken: serverEnv.twilioAuthToken, url, params, signature })) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  }

  const streamUrl = process.env.VOICE_STREAM_URL || null;
  if (streamUrl && streamUrl.startsWith('wss://')) {
    return xmlResponse(
      buildVoiceTwiml({
        greeting: 'Please hold while we connect your call.',
        streamUrl,
      }),
    );
  }

  if (!hasAdminCredentials()) {
    return xmlResponse(
      buildVoiceTwiml({
        greeting: 'Thank you for calling. Our automated assistant is not available yet. Goodbye.',
      }),
    );
  }

  const agentId = new URL(request.url).searchParams.get('agentId');
  const ownerId = new URL(request.url).searchParams.get('ownerId');

  try {
    if (agentId && ownerId) {
      const snap = await getAdminDb()
        .collection('users')
        .doc(ownerId)
        .collection('agents')
        .doc(agentId)
        .get();
      if (snap.exists) {
        const agent = serializeAgent(snap.id, snap.data() as Record<string, unknown>);
        return xmlResponse(
          buildVoiceTwiml({
            greeting:
              agent.welcomeMessage ||
              `Hello, you have reached ${agent.businessName || 'our business'}. Voice calling is not active yet. Goodbye.`,
          }),
        );
      }
    }
  } catch {
    // Fall through to the safe default below.
  }

  return xmlResponse(
    buildVoiceTwiml({
      greeting: 'Thank you for calling. Live voice calls are not available yet. Please contact the business directly. Goodbye.',
    }),
  );
}
