import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import type { Agent, CallRecord, Workspace } from '@/lib/types';
import { apiErrors } from '@/lib/api/errors';

/** Convert Firestore timestamps into ISO strings for JSON responses. */
export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      return (value as Timestamp).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') return value;
  return null;
}

export function serializeAgent(id: string, data: Record<string, unknown>): Agent {
  return {
    id,
    ownerId: (data.ownerId as string) || '',
    workspaceId: (data.workspaceId as string) || '',
    name: (data.name as string) || 'Untitled agent',
    purpose: (data.purpose as string) || '',
    businessName: (data.businessName as string) || '',
    personality: (data.personality as string) || '',
    speakingStyle: (data.speakingStyle as string) || '',
    systemInstructions: (data.systemInstructions as string) || '',
    language: (data.language as string) || 'en-US',
    voiceProvider: (data.voiceProvider as Agent['voiceProvider']) || 'browser',
    voiceId: (data.voiceId as string) || 'browser-default',
    speakingRate: typeof data.speakingRate === 'number' ? data.speakingRate : 1,
    welcomeMessage: (data.welcomeMessage as string) || '',
    faqs: Array.isArray(data.faqs) ? (data.faqs as Agent['faqs']) : [],
    knowledge: (data.knowledge as string) || '',
    callHandlingInstructions: (data.callHandlingInstructions as string) || '',
    transferInstructions: (data.transferInstructions as string) || '',
    transferNumber: (data.transferNumber as string) || '',
    businessHours: (data.businessHours as string) || '',
    status: data.status === 'inactive' ? 'inactive' : 'active',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export function serializeWorkspace(id: string, data: Record<string, unknown>): Workspace {
  return {
    id,
    ownerId: (data.ownerId as string) || '',
    name: (data.name as string) || '',
    description: (data.description as string) || '',
    contactEmail: (data.contactEmail as string) || '',
    contactPhone: (data.contactPhone as string) || '',
    website: (data.website as string) || '',
    timezone: (data.timezone as string) || 'UTC',
    businessHours: (data.businessHours as string) || '',
    faqs: Array.isArray(data.faqs) ? (data.faqs as Workspace['faqs']) : [],
    products: (data.products as string) || '',
    appointmentInstructions: (data.appointmentInstructions as string) || '',
    escalationContact: (data.escalationContact as string) || '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/** Load an agent the caller owns. Cross-tenant access is impossible here. */
export async function fetchOwnedAgent(uid: string, agentId: string): Promise<Agent> {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(agentId)) throw apiErrors.badRequest('Invalid agent id.');
  const snap = await getAdminDb().collection('users').doc(uid).collection('agents').doc(agentId).get();
  if (!snap.exists) throw apiErrors.notFound('Agent not found.');
  const data = snap.data() as Record<string, unknown>;
  if (data.ownerId && data.ownerId !== uid) throw apiErrors.notFound('Agent not found.');
  return serializeAgent(snap.id, data);
}

/** Workspace doc id is the owner uid, so isolation is structural. */
export async function fetchOwnedWorkspace(uid: string): Promise<Workspace | null> {
  const snap = await getAdminDb().collection('workspaces').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  if (data.ownerId && data.ownerId !== uid) return null;
  return serializeWorkspace(snap.id, data);
}

/** Create/refresh the profile document without clobbering user edits. */
export async function ensureProfile(uid: string, email: string | null, displayName: string | null) {
  const ref = getAdminDb().collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      uid,
      email: email || '',
      displayName: displayName || email?.split('@')[0] || '',
      workspaceId: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  const data = snap.data() || {};
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (email && data.email !== email) patch.email = email;
  if (!data.workspaceId) patch.workspaceId = uid;
  await ref.set(patch, { merge: true });
}

export function serializeCall(id: string, data: Record<string, unknown>): CallRecord {
  return {
    id,
    ownerId: (data.ownerId as string) || '',
    workspaceId: (data.workspaceId as string) || '',
    agentId: (data.agentId as string) || null,
    agentName: (data.agentName as string) || null,
    direction: data.direction === 'outbound' ? 'outbound' : 'inbound',
    from: (data.from as string) || '',
    to: (data.to as string) || '',
    status: (data.status as CallRecord['status']) || 'queued',
    startTime: toIso(data.startTime),
    endTime: toIso(data.endTime),
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : 0,
    transcript: (data.transcript as string) || null,
    summary: (data.summary as string) || null,
    outcome: (data.outcome as string) || null,
    failureReason: (data.failureReason as string) || null,
    provider: 'twilio',
    providerCallId: (data.providerCallId as string) || null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
