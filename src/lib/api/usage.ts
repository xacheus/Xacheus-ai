import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getPlan } from '@/lib/plans';
import type { PlanId, Subscription, UsageCounter } from '@/lib/types';
import { apiErrors } from './errors';

export function currentMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const EMPTY_USAGE: UsageCounter = {
  month: '',
  transcriptionSeconds: 0,
  transcriptionCount: 0,
  chatRequests: 0,
  chatTokens: 0,
  callMinutes: 0,
  callCount: 0,
  estimatedCostUsd: 0,
};

export interface UsageSnapshot {
  month: string;
  planId: PlanId;
  planName: string;
  usage: UsageCounter;
  limits: ReturnType<typeof getPlan>['limits'];
  subscriptionStatus: Subscription['status'];
}

function db(): Firestore {
  return getAdminDb();
}

function usageDocRef(uid: string, month = currentMonthKey()) {
  return db().collection('users').doc(uid).collection('usage').doc(month);
}

export async function readSubscription(uid: string): Promise<Subscription> {
  const snap = await db().collection('subscriptions').doc(uid).get();
  if (!snap.exists) {
    return { ownerId: uid, planId: 'starter', status: 'none', billingProvider: 'none' };
  }
  const data = snap.data() as Partial<Subscription> | undefined;
  return {
    ownerId: uid,
    planId: (data?.planId as PlanId) || 'starter',
    status: (data?.status as Subscription['status']) || 'none',
    billingProvider: (data?.billingProvider as Subscription['billingProvider']) || 'none',
    currentPeriodStart: data?.currentPeriodStart,
    currentPeriodEnd: data?.currentPeriodEnd,
  };
}

export async function readUsage(uid: string, month = currentMonthKey()): Promise<UsageCounter> {
  const snap = await usageDocRef(uid, month).get();
  const data = (snap.data() || {}) as Partial<UsageCounter>;
  return {
    month,
    transcriptionSeconds: data.transcriptionSeconds ?? 0,
    transcriptionCount: data.transcriptionCount ?? 0,
    chatRequests: data.chatRequests ?? 0,
    chatTokens: data.chatTokens ?? 0,
    callMinutes: data.callMinutes ?? 0,
    callCount: data.callCount ?? 0,
    estimatedCostUsd: data.estimatedCostUsd ?? 0,
  };
}

export async function readUsageSnapshot(uid: string): Promise<UsageSnapshot> {
  const [usage, subscription] = await Promise.all([readUsage(uid), readSubscription(uid)]);
  const plan = getPlan(subscription.planId);
  return {
    month: usage.month,
    planId: plan.id,
    planName: plan.name,
    usage,
    limits: plan.limits,
    subscriptionStatus: subscription.status,
  };
}

export type QuotaKind = 'transcription' | 'chat' | 'callMinutes';

export interface QuotaCheck {
  /** Amount requested for this call. */
  amount: number;
  /** Consumption so far this month. */
  used: number;
  /** Monthly allowance, or null when the plan has custom/unlimited limits. */
  limit: number | null;
  remaining: number | null;
}

/** Read-only quota check. Call before an expensive provider request. */
export async function checkQuota(uid: string, kind: QuotaKind, amount: number): Promise<QuotaCheck> {
  const [usage, subscription] = await Promise.all([readUsage(uid), readSubscription(uid)]);
  const limits = getPlan(subscription.planId).limits;
  const used = usedFor(usage, kind);
  const limit = limitFor(limits, kind);
  const remaining = limit === null ? null : Math.max(0, limit - used);

  if (limit !== null && used + amount > limit) {
    throw apiErrors.quotaExceeded(`${labelFor(kind)} limit reached for your ${getPlan(subscription.planId).name} plan.`, {
      kind,
      used,
      limit,
      requested: amount,
      month: usage.month,
    });
  }
  return { amount, used, limit, remaining };
}

export interface UsageDelta {
  transcriptionSeconds?: number;
  transcriptionCount?: number;
  chatRequests?: number;
  chatTokens?: number;
  callMinutes?: number;
  callCount?: number;
  estimatedCostUsd?: number;
}

/** Atomically increment counters for the current month. */
export async function recordUsage(uid: string, delta: UsageDelta, month = currentMonthKey()): Promise<void> {
  const ref = usageDocRef(uid, month);
  const payload: Record<string, unknown> = {
    month,
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const [key, value] of Object.entries(delta)) {
    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
      payload[key] = FieldValue.increment(value);
    }
  }
  if (Object.keys(payload).length === 2) return; // nothing to record
  await ref.set(payload, { merge: true });
}

/** Reverse a reservation when the provider call fails. */
export async function refundUsage(uid: string, delta: UsageDelta, month = currentMonthKey()): Promise<void> {
  const inverse: UsageDelta = {};
  for (const [key, value] of Object.entries(delta)) {
    if (typeof value === 'number') {
      inverse[key as keyof UsageDelta] = -value;
    }
  }
  await recordUsage(uid, inverse, month);
}

export async function countAgents(uid: string): Promise<number> {
  const snap = await db().collection('users').doc(uid).collection('agents').count().get();
  return snap.data().count;
}

/** Enforce the plan's agent allowance before creating an agent. */
export async function assertAgentAllowance(uid: string): Promise<void> {
  const [subscription, existing] = await Promise.all([readSubscription(uid), countAgents(uid)]);
  const plan = getPlan(subscription.planId);
  if (plan.limits?.agents === null || plan.limits === null) return;
  if (existing >= plan.limits.agents) {
    throw apiErrors.quotaExceeded(
      `Your ${plan.name} plan allows ${plan.limits.agents} agent${plan.limits.agents === 1 ? '' : 's'}. Deactivate and delete an agent, or upgrade.`,
      { used: existing, limit: plan.limits.agents, kind: 'agents' },
    );
  }
}

function usedFor(usage: UsageCounter, kind: QuotaKind): number {
  switch (kind) {
    case 'transcription':
      return usage.transcriptionSeconds;
    case 'chat':
      return usage.chatRequests;
    case 'callMinutes':
      return usage.callMinutes;
  }
}

function limitFor(limits: ReturnType<typeof getPlan>['limits'], kind: QuotaKind): number | null {
  if (!limits) return null;
  switch (kind) {
    case 'transcription':
      return limits.transcriptionSecondsPerMonth;
    case 'chat':
      return limits.chatRequestsPerMonth;
    case 'callMinutes':
      return limits.callMinutesPerMonth;
  }
}

function labelFor(kind: QuotaKind): string {
  switch (kind) {
    case 'transcription':
      return 'Speech-to-text';
    case 'chat':
      return 'Conversation';
    case 'callMinutes':
      return 'Telephone minute';
  }
}
