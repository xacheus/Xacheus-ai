import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, hasAdminCredentials } from '@/lib/firebase/admin';

/**
 * Minimal error monitor. Writes structured, non-sensitive metadata to
 * `systemErrors` so administrators can see failures without provider payloads,
 * audio, tokens or personal data.
 */
export async function logServerError(entry: {
  scope: string;
  error: unknown;
  requestId?: string;
  uid?: string;
  status?: number;
  code?: string;
}) {
  if (!hasAdminCredentials()) return;
  try {
    const message =
      entry.error instanceof Error ? entry.error.message.slice(0, 500) : String(entry.error).slice(0, 500);
    await getAdminDb().collection('systemErrors').add({
      scope: entry.scope,
      message,
      code: entry.code || (entry.error as { code?: string })?.code || null,
      status: entry.status ?? null,
      requestId: entry.requestId || null,
      uid: entry.uid || null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Monitoring must never break a request.
  }
}
