import { NextResponse } from 'next/server';
import { providerStatus } from '@/lib/env';
import { adminReadiness } from '@/lib/firebase/admin';
import { PLANS } from '@/lib/plans';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public capability probe. Contains no secrets — only booleans and public
 * configuration, used by the UI to show honest "not activated" states.
 */
export async function GET() {
  const providers = providerStatus();
  return NextResponse.json(
    {
      app: 'VOICEPILOT AI',
      environment: process.env.NODE_ENV,
      providers,
      infrastructure: {
        firebaseProject: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'xacheus-ai',
        serverMetering: adminReadiness() === 'ready',
        telephonyActive: providers.telephony.callingEnabled,
      },
      plans: PLANS.map((plan) => ({
        id: plan.id,
        name: plan.name,
        priceMonthlyUsd: plan.priceMonthlyUsd,
        limits: plan.limits,
      })),
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
