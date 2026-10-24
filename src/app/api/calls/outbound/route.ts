import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { apiErrors, errorResponse, newRequestId } from '@/lib/api/errors';
import { authenticateRequest, requireVerifiedEmail } from '@/lib/api/auth';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { checkQuota } from '@/lib/api/usage';
import { outboundCallSchema, parseJson } from '@/lib/api/validation';
import { getAdminDb } from '@/lib/firebase/admin';
import { fetchOwnedAgent, fetchOwnedWorkspace } from '@/lib/server/repository';
import { createOutboundCall, telephonyStatusReason, telephonyUsable } from '@/lib/telephony/twilio';
import { logServerError } from '@/lib/server/errors-log';
import { providerStatus } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Outbound calls require: authenticated + verified user, explicit consent flag,
 * active telephony configuration, a per-hour limit and remaining minute quota.
 * Nothing here runs automatically.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  let uid: string | undefined;

  try {
    const user = await authenticateRequest(request);
    uid = user.uid;
    requireVerifiedEmail(user);
    enforceRateLimit(`calls:outbound:${user.uid}`, 5, 60 * 60 * 1000);

    if (!telephonyUsable()) {
      throw apiErrors.providerNotConfigured(
        'Telephone calling is not activated on this deployment.',
        telephonyStatusReason() || 'Configure a telephony provider and enable calling.',
      );
    }

    const body = await parseJson(request, outboundCallSchema);
    if (body.consentConfirmed !== true) {
      throw apiErrors.badRequest('You must confirm the recipient consented to this call.');
    }

    const [agent, workspace] = await Promise.all([
      fetchOwnedAgent(user.uid, body.agentId),
      fetchOwnedWorkspace(user.uid),
    ]);
    if (agent.status !== 'active') throw apiErrors.badRequest('Activate the agent before placing calls.');
    await checkQuota(user.uid, 'callMinutes', 1);

    const result = await createOutboundCall({
      to: body.toNumber,
      agentId: agent.id,
      ownerId: user.uid,
    });

    const now = FieldValue.serverTimestamp();
    const callRef = getAdminDb().collection('calls').doc();
    await callRef.set({
      ownerId: user.uid,
      workspaceId: user.uid,
      agentId: agent.id,
      agentName: agent.name,
      direction: 'outbound',
      from: providerStatus().telephony.phoneNumber,
      to: body.toNumber,
      status: result.status,
      startTime: now,
      durationSeconds: 0,
      transcript: null,
      summary: null,
      outcome: null,
      failureReason: null,
      provider: 'twilio',
      providerCallId: result.providerCallId,
      businessName: workspace?.name || agent.businessName || '',
      consentConfirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(
      {
        call: { id: callRef.id, providerCallId: result.providerCallId, status: result.status },
        notice: 'The call was requested from the telephony provider. Status updates arrive via webhook.',
        requestId,
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await logServerError({ scope: 'calls:outbound', error, requestId, uid });
    if (error instanceof Error && /Twilio rejected/.test(error.message)) {
      return errorResponse(apiErrors.providerError(error.message), requestId);
    }
    return errorResponse(error, requestId);
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: {
        code: 'method_not_allowed',
        message: 'Outbound calling requires an explicit POST with consent confirmation.',
      },
    },
    { status: 405 },
  );
}
