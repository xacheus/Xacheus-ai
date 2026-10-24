'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, CheckCircle2, CreditCard, Info, Mic, PhoneCall, Sparkles, Wallet } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Modal,
  PageHeader,
  SkeletonLines,
  cn,
} from '@/components/ui';
import { PLANS, formatPrice } from '@/lib/plans';
import { formatUsd } from '@/lib/pricing';
import { formatDuration } from '@/lib/client/firestore-data';

function Meter({
  label,
  used,
  limit,
  unit,
  hint,
}: {
  label: string;
  used: number;
  limit: number | null;
  unit: string;
  hint?: string;
}) {
  const percent = limit === null ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const tone = percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-brand-600';

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-800">{label}</p>
        <p className="text-[12px] tabular-nums text-muted">
          {used.toLocaleString('en-US')} {unit}
          {limit === null ? ' · custom limit' : ` of ${limit.toLocaleString('en-US')} ${unit}`}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${limit === null ? 4 : percent}%` }} />
      </div>
      {hint && <p className="mt-1.5 text-[11.5px] text-muted">{hint}</p>}
    </div>
  );
}

export default function UsagePage() {
  const { account, accountLoading, refreshAccount } = useAuth();
  const [upgradePlan, setUpgradePlan] = useState<(typeof PLANS)[number] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const usage = account?.usage;
  const limits = account?.limits;
  const usageMonthLabel = useMemo(() => {
    if (!usage?.month) return null;
    const [year, month] = usage.month.split('-').map(Number);
    return new Date(Date.UTC(year, (month || 1) - 1, 1)).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [usage?.month]);

  async function refresh() {
    setRefreshing(true);
    await refreshAccount().catch(() => undefined);
    setRefreshing(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Billing and usage"
        title="Usage & plan"
        description="Counters are recorded on the server per calendar month (UTC) and reset automatically on the first of the month."
        actions={
          <Button variant="secondary" onClick={refresh} loading={refreshing}>
            Refresh usage
          </Button>
        }
      />

      {account && !account.serverMetering && (
        <Alert tone="warning" title="Usage metering is not available" className="mb-4">
          The server cannot read or write usage counters because Firebase Admin credentials are missing. Limits cannot be
          enforced until <code className="rounded bg-amber-100 px-1">FIREBASE_SERVICE_ACCOUNT_KEY</code> is configured.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="This month's usage"
            description={usageMonthLabel ? `Period: ${usageMonthLabel}` : 'Waiting for usage data'}
            action={<Badge tone="brand">{account?.planName || 'Starter'} plan</Badge>}
          />
          <div className="card-body">
            {accountLoading && !usage ? (
              <SkeletonLines count={5} />
            ) : (
              <div className="space-y-5">
                <Meter
                  label="Speech-to-text audio"
                  used={Math.round((usage?.transcriptionSeconds ?? 0) / 60)}
                  limit={limits?.transcriptionSecondsPerMonth !== null && limits?.transcriptionSecondsPerMonth !== undefined
                    ? Math.round(limits.transcriptionSecondsPerMonth / 60)
                    : null}
                  unit="minutes"
                  hint={`${usage?.transcriptionCount ?? 0} transcription requests charged against this month`}
                />
                <Meter
                  label="Test conversations"
                  used={usage?.chatRequests ?? 0}
                  limit={limits?.chatRequestsPerMonth ?? null}
                  unit="turns"
                  hint="Text or transcribed turns answered by your agents — not telephone calls"
                />
                <Meter
                  label="Telephone minutes"
                  used={usage?.callMinutes ?? 0}
                  limit={limits?.callMinutesPerMonth ?? null}
                  unit="minutes"
                  hint={
                    account?.capabilities?.telephony.callingEnabled
                      ? 'Billed per started minute after a call completes'
                      : 'Calling is not activated, so no minutes can be used'
                  }
                />
                <Meter
                  label="AI agents"
                  used={0}
                  limit={limits?.agents ?? null}
                  unit="agents"
                  hint="Agent count is checked when you create an agent"
                />
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Estimated provider cost" />
            <div className="card-body">
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-semibold tracking-tight text-ink-950">
                  {formatUsd(usage?.estimatedCostUsd ?? 0)}
                </p>
                <span className="text-xs text-muted">this month</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Calculated from Groq list prices at the time of each request (Whisper and language-model tokens). This is an
                estimate for your information — no invoice is generated and no payment is taken.
              </p>
              <dl className="mt-4 space-y-2 border-t border-line pt-3 text-[12px]">
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-1.5 text-muted">
                    <Mic className="h-3.5 w-3.5" aria-hidden />
                    Transcription
                  </dt>
                  <dd className="tabular-nums text-ink-800">
                    {formatDuration(usage?.transcriptionSeconds ?? 0)} audio
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-1.5 text-muted">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Language model
                  </dt>
                  <dd className="tabular-nums text-ink-800">{(usage?.chatTokens ?? 0).toLocaleString('en-US')} tokens</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-1.5 text-muted">
                    <PhoneCall className="h-3.5 w-3.5" aria-hidden />
                    Telephone
                  </dt>
                  <dd className="tabular-nums text-ink-800">
                    {account?.capabilities?.telephony.callingEnabled ? `${usage?.callMinutes ?? 0} min` : 'Not activated'}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Billing status" />
            <div className="card-body space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5">
                <CreditCard className="h-4 w-4 text-muted" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink-900">No payment provider connected</p>
                  <p className="text-[11.5px] text-muted">Subscriptions cannot be purchased yet.</p>
                </div>
              </div>
              <p className="text-[12px] leading-relaxed text-muted">
                Plan status and usage limits are stored server-side, separately from your editable profile. Nothing is
                charged until a payment provider is integrated and tested.
              </p>
              <Button variant="secondary" className="w-full" onClick={() => setUpgradePlan(PLANS[1])}>
                Compare plans
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Plan comparison"
          description="Limits are enforced on the server. Prices are proposals and can be changed by configuration."
        />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Agents</th>
                <th>Speech-to-text</th>
                <th>Test turns</th>
                <th>Call minutes</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((plan) => {
                const current = plan.id === account?.planId;
                return (
                  <tr key={plan.id} className={current ? 'bg-brand-50/50' : undefined}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-950">{plan.name}</span>
                        {current && <Badge tone="brand">Current</Badge>}
                      </div>
                      <p className="mt-0.5 max-w-[220px] text-[11.5px] text-muted">{plan.tagline}</p>
                    </td>
                    <td className="whitespace-nowrap">
                      {formatPrice(plan)}
                      {plan.priceMonthlyUsd !== null && <span className="text-[11px] text-muted">/mo</span>}
                    </td>
                    <td className="tabular-nums">{plan.limits?.agents ?? 'Custom'}</td>
                    <td className="tabular-nums">
                      {plan.limits ? `${Math.round((plan.limits.transcriptionSecondsPerMonth ?? 0) / 60)} min` : 'Custom'}
                    </td>
                    <td className="tabular-nums">{plan.limits?.chatRequestsPerMonth?.toLocaleString('en-US') ?? 'Custom'}</td>
                    <td className="tabular-nums">{plan.limits?.callMinutesPerMonth ?? 'Custom'}</td>
                    <td className="text-right">
                      {current ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Active
                        </span>
                      ) : (
                        <Button variant="secondary" small onClick={() => setUpgradePlan(plan)}>
                          {plan.id === 'enterprise' ? 'Contact sales' : 'Select'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-[11.5px] leading-relaxed text-muted">
          Free usage is limited to the Starter allowance shown above. When a limit is reached, the server rejects further
          requests for that feature until the counter resets or a plan is changed. Retrieval of unused allowance is not
          automatic.
        </div>
      </Card>

      <Card className="mt-4 border-line">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-600">
              <Bot className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-950">How limits are enforced</p>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
                Every transcription, conversation turn and call minute is checked by the server before the provider is
                called. Browser code cannot raise a limit or edit usage counters. Monthly counters are keyed by month and
                cannot be decremented by clients.
              </p>
            </div>
          </div>
          <Link href="/app/settings">
            <Button variant="ghost">Account settings</Button>
          </Link>
        </div>
      </Card>

      <Modal
        open={Boolean(upgradePlan)}
        onClose={() => setUpgradePlan(null)}
        title={`${upgradePlan?.name ?? ''} plan`}
        description="Plan changes are not self-service yet."
        footer={<Button variant="secondary" onClick={() => setUpgradePlan(null)}>Close</Button>}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <Info className="h-3.5 w-3.5" aria-hidden />
              Payment is not connected
            </p>
            <p className="mt-1 leading-relaxed">
              Checkout, card storage and subscription billing require a payment provider integration. Until then, plans are
              changed by a platform administrator and no money is collected.
            </p>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-ink-900">What this plan includes</p>
            <ul className="mt-2 space-y-1.5">
              {upgradePlan?.features.map((feature) => (
                <li key={feature} className="flex gap-2 text-[12.5px] text-ink-700">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Ask your administrator to assign this plan. Usage limits apply immediately after the change.
          </div>
        </div>
      </Modal>
    </div>
  );
}
