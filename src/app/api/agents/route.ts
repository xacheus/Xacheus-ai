import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { apiErrors, errorResponse, newRequestId } from '@/lib/api/errors';
import { authenticateRequest } from '@/lib/api/auth';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { assertAgentAllowance, readUsageSnapshot } from '@/lib/api/usage';
import { agentInputSchema, parseJson } from '@/lib/api/validation';
import { getAdminDb } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/server/errors-log';
import { ensureProfile, serializeAgent } from '@/lib/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Create an agent. Enforces the plan's agent allowance server-side. */
export async function POST(request: Request) {
  const requestId = newRequestId();
  let uid: string | undefined;
  try {
    const user = await authenticateRequest(request);
    uid = user.uid;
    enforceRateLimit(`agents:create:${user.uid}`, 10, 60 * 60 * 1000);

    const input = await parseJson(request, agentInputSchema);
    await Promise.all([
      ensureProfile(user.uid, user.email, user.displayName),
      assertAgentAllowance(user.uid),
    ]);

    const db = getAdminDb();
    const ref = db.collection('users').doc(user.uid).collection('agents').doc();
    const now = FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();

    await ref.set({
      ...input,
      ownerId: user.uid,
      workspaceId: user.uid,
      createdAt: now,
      updatedAt: now,
    });

    const snapshot = await readUsageSnapshot(user.uid).catch(() => null);
    return NextResponse.json(
      {
        agent: serializeAgent(ref.id, {
          ...input,
          ownerId: user.uid,
          workspaceId: user.uid,
          createdAt: nowIso,
          updatedAt: nowIso,
        }),
        limits: snapshot?.limits ?? null,
        requestId,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await logServerError({ scope: 'agents:create', error, requestId, uid });
    return errorResponse(error, requestId);
  }
}

export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);
    const snap = await getAdminDb()
      .collection('users')
      .doc(user.uid)
      .collection('agents')
      .orderBy('createdAt', 'desc')
      .get();

    return NextResponse.json(
      {
        agents: snap.docs.map((document) => serializeAgent(document.id, document.data())),
        requestId,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'GET, POST' } });
}

export function PUT() {
  return errorResponse(apiErrors.badRequest('Use POST to create an agent.'), newRequestId());
}
