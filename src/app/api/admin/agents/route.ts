import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { apiErrors, errorResponse, newRequestId } from '@/lib/api/errors';
import { requireAdmin } from '@/lib/api/auth';
import { getAdminDb } from '@/lib/firebase/admin';
import { parseJson } from '@/lib/api/validation';
import { z } from 'zod';
import { logServerError } from '@/lib/server/errors-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cross-tenant agent inventory for administrators (moderation only). */
export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    await requireAdmin(request);
    const snap = await getAdminDb().collectionGroup('agents').limit(200).get();

    const agents = snap.docs.map((document) => {
      const data = document.data();
      const ownerId = document.ref.parent.parent?.id || (data.ownerId as string) || '';
      return {
        id: document.id,
        ownerId,
        name: (data.name as string) || 'Untitled agent',
        status: data.status === 'inactive' ? 'inactive' : 'active',
        language: (data.language as string) || 'en-US',
        businessName: (data.businessName as string) || '',
        updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ agents, truncated: snap.size >= 200, requestId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await logServerError({ scope: 'admin:agents', error, requestId });
    return errorResponse(error, requestId);
  }
}

const moderationSchema = z.object({
  ownerId: z.string().trim().min(1).max(128),
  agentId: z.string().trim().min(1).max(128),
  status: z.enum(['active', 'inactive']),
  reason: z.string().trim().max(300).default(''),
});

/** Deactivate or reactivate an agent during abuse handling. */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const admin = await requireAdmin(request);
    const body = await parseJson(request, moderationSchema);

    const ref = getAdminDb()
      .collection('users')
      .doc(body.ownerId)
      .collection('agents')
      .doc(body.agentId);

    const existing = await ref.get();
    if (!existing.exists) throw apiErrors.notFound('Agent not found.');

    await ref.set({ status: body.status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await getAdminDb().collection('adminAudit').add({
      actorUid: admin.uid,
      action: 'agent.status',
      targetUid: body.ownerId,
      agentId: body.agentId,
      status: body.status,
      reason: body.reason || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ updated: true, requestId });
  } catch (error) {
    await logServerError({ scope: 'admin:agent-moderate', error, requestId });
    return errorResponse(error, requestId);
  }
}
