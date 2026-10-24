import { NextResponse } from 'next/server';
import { apiErrors, errorResponse, newRequestId } from '@/lib/api/errors';
import { authenticateRequest } from '@/lib/api/auth';
import { getAdminDb } from '@/lib/firebase/admin';
import { serializeCall } from '@/lib/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const snap = await getAdminDb().collection('calls').doc(id).get();
    if (!snap.exists) throw apiErrors.notFound('Call not found.');
    const data = snap.data() as Record<string, unknown>;
    // Ownership is checked server-side; a mismatch is reported as not-found.
    if (data.ownerId !== user.uid) throw apiErrors.notFound('Call not found.');
    return NextResponse.json({ call: serializeCall(snap.id, data), requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

/** Deletes the call metadata record. Audio is never stored, so nothing else is removed. */
export async function DELETE(request: Request, { params }: Params) {
  const requestId = newRequestId();
  try {
    const user = await authenticateRequest(request);
    const { id } = await params;
    const ref = getAdminDb().collection('calls').doc(id);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as { ownerId?: string }).ownerId !== user.uid) {
      throw apiErrors.notFound('Call not found.');
    }
    await ref.delete();
    return NextResponse.json({ deleted: true, id, requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
