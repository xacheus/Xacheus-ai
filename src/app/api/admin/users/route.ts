import { NextResponse } from 'next/server';
import { apiErrors, errorResponse, newRequestId } from '@/lib/api/errors';
import { requireAdmin } from '@/lib/api/auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { logServerError } from '@/lib/server/errors-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Paginated user directory for administrators. Emails come from Firebase Auth. */
export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    await requireAdmin(request);

    const url = new URL(request.url);
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const pageToken = url.searchParams.get('pageToken') || undefined;

    const auth = getAdminAuth();
    const result = await auth.listUsers(100, pageToken);

    const db = getAdminDb();
    const subscriptions = await Promise.all(
      result.users.map((record) =>
        db
          .collection('subscriptions')
          .doc(record.uid)
          .get()
          .then((snapshot) => ({ uid: record.uid, data: snapshot.data() || null }))
          .catch(() => ({ uid: record.uid, data: null })),
      ),
    );
    const subscriptionMap = new Map(subscriptions.map((entry) => [entry.uid, entry.data]));

    const users = result.users
      .map((record) => {
        const subscription = subscriptionMap.get(record.uid) || {};
        return {
          uid: record.uid,
          email: record.email || '',
          displayName: record.displayName || '',
          emailVerified: record.emailVerified,
          disabled: record.disabled,
          createdAt: record.metadata.creationTime,
          lastSignInAt: record.metadata.lastSignInTime,
          isAdmin: record.customClaims?.admin === true,
          planId: (subscription.planId as string) || 'starter',
          planStatus: (subscription.status as string) || 'none',
        };
      })
      .filter((entry) =>
        search
          ? entry.email.toLowerCase().includes(search) ||
            entry.displayName.toLowerCase().includes(search) ||
            entry.uid.includes(search)
          : true,
      );

    return NextResponse.json(
      { users, nextPageToken: result.pageToken || null, requestId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await logServerError({ scope: 'admin:users', error, requestId });
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  return errorResponse(apiErrors.badRequest('Use PATCH on /api/admin/users/{uid}/plan to change a plan.'), newRequestId());
}
