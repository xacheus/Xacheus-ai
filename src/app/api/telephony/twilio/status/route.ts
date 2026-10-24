import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, hasAdminCredentials } from '@/lib/firebase/admin';
import { mapTwilioStatus, resolveWebhookUrl, telephonyConfigured, validateTwilioSignature } from '@/lib/telephony/twilio';
import { recordUsage } from '@/lib/api/usage';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Twilio status callback. Only trusted, signature-verified updates are written.
 * Duration and outcome come from the provider — never fabricated locally.
 */
export async function POST(request: Request) {
  if (!telephonyConfigured() || !hasAdminCredentials()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const url = resolveWebhookUrl(request, serverEnv.twilioWebhookBaseUrl, '/api/telephony/twilio/status');

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false }, { status: 400 });

  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value;
  });

  const signature = request.headers.get('x-twilio-signature') || '';
  if (!validateTwilioSignature({ authToken: serverEnv.twilioAuthToken, url, params, signature })) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const providerCallId = params.CallSid;
  if (!providerCallId) return NextResponse.json({ ok: false }, { status: 400 });

  const db = getAdminDb();
  const snap = await db
    .collection('calls')
    .where('providerCallId', '==', providerCallId)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ ok: true, ignored: 'unknown call' });
  }

  const callDoc = snap.docs[0];
  const existing = callDoc.data();
  const status = mapTwilioStatus(params.CallStatus || '');
  const durationSeconds = Number(params.CallDuration || 0) || 0;
  const finalStatuses = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);
  const isFinal = finalStatuses.has(status);

  const update: Record<string, unknown> = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (durationSeconds > 0) update.durationSeconds = durationSeconds;
  if (params.Timestamp) {
    const parsed = new Date(params.Timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      update.updatedAtProvider = Timestamp.fromDate(parsed);
    }
  }
  if (params.CallStatus === 'completed') {
    update.endTime = FieldValue.serverTimestamp();
    update.outcome = durationSeconds > 0 ? 'completed' : 'no-conversation';
  }
  if (['failed', 'busy', 'no-answer', 'canceled'].includes(params.CallStatus || '')) {
    update.endTime = FieldValue.serverTimestamp();
    update.outcome = params.CallStatus;
    update.failureReason = params.ErrorMessage || params.CallStatus || 'Provider reported failure.';
  }

  await callDoc.ref.set(update, { merge: true });

  // Bill call minutes once, on the final transition.
  if (isFinal && existing.status !== status && !existing.usageRecorded && durationSeconds > 0) {
    const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
    await callDoc.ref.set({ usageRecorded: true }, { merge: true });
    await recordUsage(existing.ownerId as string, { callMinutes: minutes, callCount: 1 });
  }

  return NextResponse.json({ ok: true });
}
