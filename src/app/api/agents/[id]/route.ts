import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { errorResponse, newRequestId } from '@/lib/api/errors';
import { authenticateRequest } from '@/lib/api/auth';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { agentPatchSchema, parseJson } from '@/lib/api/validation';
import { getAdminDb } from '@/lib/firebase/admin';
import { fetchOwnedAgent } from '@/lib/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    enforceRateLimit(`agents:update:${user.uid}`, 60, 60 * 60 * 1000);

    // Ownership is verified before any write.
    await fetchOwnedAgent(user.uid, id);
    const parsedPatch = await parseJson(request, agentPatchSchema);
    const patch = Object.fromEntries(
      Object.entries(parsedPatch).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ agent: await fetchOwnedAgent(user.uid, id), requestId });
    }

    await getAdminDb()
      .collection('users')
      .doc(user.uid)
      .collection('agents')
      .doc(id)
      .set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    return NextResponse.json({ agent: await fetchOwnedAgent(user.uid, id), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    enforceRateLimit(`agents:delete:${user.uid}`, 20, 60 * 60 * 1000);

    await fetchOwnedAgent(user.uid, id);
    await getAdminDb().collection('users').doc(user.uid).collection('agents').doc(id).delete();

    return NextResponse.json({ deleted: true, id, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function GET(request: Request, { params }: Params) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    return NextResponse.json({ agent: await fetchOwnedAgent(user.uid, id), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
