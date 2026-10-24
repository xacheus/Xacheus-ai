import { NextResponse } from 'next/server';
import { errorResponse, newRequestId } from '@/lib/api/errors';
import { requireAdmin } from '@/lib/api/auth';
import { getAdminDb } from '@/lib/firebase/admin';
import { toIso } from '@/lib/server/repository';
import { logServerError } from '@/lib/server/errors-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recent server errors. Contains no provider payloads, audio or credentials. */
export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    await requireAdmin(request);
    const snap = await getAdminDb()
      .collection('systemErrors')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()
      .catch(() => null);

    if (!snap) {
      return NextResponse.json(
        {
          errors: [],
          notice: 'The error collection is not readable or has no index yet. Deploy Firestore indexes to enable this view.',
          requestId,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      {
        errors: snap.docs.map((document) => {
          const data = document.data();
          return {
            id: document.id,
            scope: (data.scope as string) || 'unknown',
            message: (data.message as string) || '',
            code: (data.code as string) || null,
            status: typeof data.status === 'number' ? data.status : null,
            uid: (data.uid as string) || null,
            createdAt: toIso(data.createdAt),
          };
        }),
        requestId,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await logServerError({ scope: 'admin:errors', error, requestId });
    return errorResponse(error, requestId);
  }
}
