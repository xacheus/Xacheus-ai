import { NextResponse } from 'next/server';
import { errorResponse, newRequestId } from '@/lib/api/errors';
import { authenticateRequest } from '@/lib/api/auth';
import { hasAdminCredentials } from '@/lib/firebase/admin';
import { getAdminDb } from '@/lib/firebase/admin';
import { readUsageSnapshot } from '@/lib/api/usage';
import { getPlan } from '@/lib/plans';
import { providerStatus } from '@/lib/env';
import { ensureProfile, toIso } from '@/lib/server/repository';
import { parseJson, profileUpdateSchema } from '@/lib/api/validation';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Profile, plan, usage and capability flags for the signed-in user. */
export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);

    if (!hasAdminCredentials()) {
      return NextResponse.json(
        {
          user: { uid: user.uid, email: user.email, displayName: user.displayName },
          profile: null,
          subscription: null,
          usage: null,
          plan: getPlan('starter'),
          capabilities: providerStatus(),
          serverMetering: false,
          warning:
            'Server credentials are missing (FIREBASE_SERVICE_ACCOUNT_KEY). Usage metering, agent limits and server-side writes are disabled until it is configured.',
          requestId,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await ensureProfile(user.uid, user.email, user.displayName);

    const [snapshot, profileSnap] = await Promise.all([
      readUsageSnapshot(user.uid),
      getAdminDb().collection('users').doc(user.uid).get(),
    ]);

    const profileData = profileSnap.data() || {};
    const plan = getPlan(snapshot.planId);

    return NextResponse.json(
      {
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          isAdmin: user.claims.admin === true,
        },
        profile: {
          uid: user.uid,
          email: (profileData.email as string) || user.email || '',
          displayName: (profileData.displayName as string) || user.displayName || '',
          phone: (profileData.phone as string) || '',
          country: (profileData.country as string) || '',
          workspaceId: (profileData.workspaceId as string) || user.uid,
          retentionDays: typeof profileData.retentionDays === 'number' ? profileData.retentionDays : 0,
          createdAt: toIso(profileData.createdAt),
        },
        subscription: {
          planId: snapshot.planId,
          status: snapshot.subscriptionStatus,
          billingProvider: 'none',
        },
        plan,
        usage: snapshot.usage,
        limits: plan.limits,
        capabilities: providerStatus(),
        serverMetering: true,
        requestId,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);
    const input = await parseJson(request, profileUpdateSchema);

    await getAdminDb()
      .collection('users')
      .doc(user.uid)
      .set(
        {
          ...input,
          uid: user.uid,
          workspaceId: user.uid,
          email: user.email || '',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return NextResponse.json({ updated: true, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
