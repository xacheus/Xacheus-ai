import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { errorResponse, newRequestId } from '@/lib/api/errors';
import { authenticateRequest } from '@/lib/api/auth';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { parseJson, workspaceInputSchema } from '@/lib/api/validation';
import { getAdminDb } from '@/lib/firebase/admin';
import { ensureProfile, fetchOwnedWorkspace } from '@/lib/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Workspace id === owner uid, so one caller can never address another's doc. */
export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);
    return NextResponse.json({ workspace: await fetchOwnedWorkspace(user.uid), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PUT(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);
    enforceRateLimit(`workspace:${user.uid}`, 40, 60 * 60 * 1000);

    const input = await parseJson(request, workspaceInputSchema);
    await ensureProfile(user.uid, user.email, user.displayName);

    const existing = await fetchOwnedWorkspace(user.uid);
    await getAdminDb()
      .collection('workspaces')
      .doc(user.uid)
      .set(
        {
          ...input,
          ownerId: user.uid,
          updatedAt: FieldValue.serverTimestamp(),
          ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );

    return NextResponse.json({ workspace: await fetchOwnedWorkspace(user.uid), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
