import { NextResponse } from 'next/server';
import { adminReadiness } from '@/lib/firebase/admin';
import { groqConfigured } from '@/lib/groq/client';
import { providerStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Lightweight liveness/readiness endpoint for uptime checks. */
export async function GET() {
  const providers = providerStatus();
  const checks = {
    web: 'ok' as const,
    firebaseAdmin: adminReadiness(),
    groq: groqConfigured() ? ('configured' as const) : ('missing-key' as const),
    telephony: providers.telephony.callingEnabled ? ('active' as const) : ('inactive' as const),
  };
  const healthy = checks.groq === 'configured' && checks.firebaseAdmin === 'ready';
  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks, time: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
