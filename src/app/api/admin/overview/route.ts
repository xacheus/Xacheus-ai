import { NextResponse } from 'next/server';
import { AggregateField } from 'firebase-admin/firestore';
import { errorResponse, newRequestId } from '@/lib/api/errors';
import { requireAdmin } from '@/lib/api/auth';
import { getAdminDb, adminReadiness } from '@/lib/firebase/admin';
import { currentMonthKey } from '@/lib/api/usage';
import { PLANS } from '@/lib/plans';
import { providerStatus } from '@/lib/env';
import { logServerError } from '@/lib/server/errors-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function safeCount(build: () => Promise<number>, fallback = 0): Promise<number> {
  try {
    return await build();
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    await requireAdmin(request);
    const db = getAdminDb();
    const month = currentMonthKey();

    const [users, agents, calls, completedCalls, failedCalls, openErrors, subscriptions] = await Promise.all([
      safeCount(async () => (await db.collection('users').count().get()).data().count),
      safeCount(async () => (await db.collectionGroup('agents').count().get()).data().count),
      safeCount(async () => (await db.collection('calls').count().get()).data().count),
      safeCount(async () => (await db.collection('calls').where('status', '==', 'completed').count().get()).data().count),
      safeCount(
        async () =>
          (await db.collection('calls').where('status', 'in', ['failed', 'busy', 'no-answer', 'canceled']).count().get())
            .data().count,
      ),
      safeCount(
        async () =>
          (
            await db
              .collection('systemErrors')
              .where('createdAt', '>=', new Date(Date.now() - 86_400_000))
              .count()
              .get()
          ).data().count,
      ),
      db.collection('subscriptions').limit(500).get().catch(() => null),
    ]);

    const planDistribution: Record<string, number> = Object.fromEntries(PLANS.map((plan) => [plan.id, 0]));
    subscriptions?.docs.forEach((snapshot) => {
      const planId = (snapshot.data().planId as string) || 'starter';
      planDistribution[planId] = (planDistribution[planId] || 0) + 1;
    });

    let usage: { transcriptionSeconds: number; chatRequests: number; callMinutes: number; estimatedCostUsd: number } = {
      transcriptionSeconds: 0,
      chatRequests: 0,
      callMinutes: 0,
      estimatedCostUsd: 0,
    };

    try {
      const aggregate = await db
        .collectionGroup('usage')
        .where('month', '==', month)
        .aggregate({
          transcriptionSeconds: AggregateField.sum('transcriptionSeconds'),
          chatRequests: AggregateField.sum('chatRequests'),
          callMinutes: AggregateField.sum('callMinutes'),
          estimatedCostUsd: AggregateField.sum('estimatedCostUsd'),
        })
        .get();
      const data = aggregate.data() as Record<string, number | null>;
      usage = {
        transcriptionSeconds: data.transcriptionSeconds ?? 0,
        chatRequests: data.chatRequests ?? 0,
        callMinutes: data.callMinutes ?? 0,
        estimatedCostUsd: data.estimatedCostUsd ?? 0,
      };
    } catch {
      const docs = await db.collectionGroup('usage').where('month', '==', month).limit(500).get().catch(() => null);
      docs?.docs.forEach((snapshot) => {
        const data = snapshot.data();
        usage.transcriptionSeconds += Number(data.transcriptionSeconds) || 0;
        usage.chatRequests += Number(data.chatRequests) || 0;
        usage.callMinutes += Number(data.callMinutes) || 0;
        usage.estimatedCostUsd += Number(data.estimatedCostUsd) || 0;
      });
    }

    return NextResponse.json(
      {
        counts: { users, agents, calls, completedCalls, failedCalls, openErrors },
        planDistribution,
        usageThisMonth: { month, ...usage },
        providers: providerStatus(),
        infrastructure: {
          firebaseAdmin: adminReadiness(),
          serverMetering: adminReadiness() === 'ready',
        },
        requestId,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await logServerError({ scope: 'admin:overview', error, requestId });
    return errorResponse(error, requestId);
  }
}
