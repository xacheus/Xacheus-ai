import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { apiErrors, errorResponse, newRequestId } from '@/lib/api/errors';
import { requireAdmin } from '@/lib/api/auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { adminPlanOverrideSchema, parseJson } from '@/lib/api/validation';
import { PLANS } from '@/lib/plans';
import { logServerError } from '@/lib/server/errors-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Administrative plan assignment. This is separate from user-editable profile
 * data and is recorded in an audit log. No payment is taken.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const requestId = newRequestId();
  try {
    const admin = await requireAdmin(request);
    const { uid } = await params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw apiErrors.badRequest('Invalid user id.');

    const body = await parseJson(request, adminPlanOverrideSchema);
    const plan = PLANS.find((entry) => entry.id === body.planId);
    if (!plan) throw apiErrors.badRequest('Unknown plan.');

    const target = await getAdminAuth().getUser(uid).catch(() => null);
    if (!target) throw apiErrors.notFound('User not found.');

    await getAdminDb()
      .collection('subscriptions')
      .doc(uid)
      .set(
        {
          ownerId: uid,
          planId: plan.id,
          status: 'active',
          billingProvider: 'none',
          assignedBy: admin.uid,
          assignedAt: FieldValue.serverTimestamp(),
          note: body.note || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    await getAdminDb().collection('adminAudit').add({
      actorUid: admin.uid,
      action: 'plan.assign',
      targetUid: uid,
      planId: plan.id,
      note: body.note || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ updated: true, uid, planId: plan.id, requestId });
  } catch (error) {
    await logServerError({ scope: 'admin:plan', error, requestId });
    return errorResponse(error, requestId);
  }
}
