'use client';

import Link from 'next/link';
import {
  Activity,
  Bot,
  Building2,
  CheckCircle2,
  Circle,
  Clock3,
  Mic,
  PhoneCall,
  PhoneOff,
  Plus,
  Sparkles,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useAgents, useCalls, useWorkspace, formatDateTime, formatDuration } from '@/lib/client/firestore-data';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SkeletonLines,
  StatCard,
} from '@/components/ui';
import { formatUsd } from '@/lib/pricing';

export default function DashboardPage() {
  const { user, account, accountLoading } = useAuth();
  const { data: agents, loading: agentsLoading } = useAgents(user?.uid);
  const { data: calls, loading: callsLoading } = useCalls(user?.uid, 50);
  const { data: workspace, loading: workspaceLoading } = useWorkspace(user?.uid);

  const activeAgents = agents?.filter((agent) => agent.status === 'active') ?? [];
  const totalCalls = calls?.length ?? 0;
  const completedCalls = calls?.filter((call) => call.status === 'completed').length ?? 0;
  const failedCalls =
    calls?.filter((call) => ['failed', 'busy', 'no-answer', 'canceled'].includes(call.status)).length ?? 0;
  const totalCallSeconds = calls?.reduce((sum, call) => sum + (call.durationSeconds || 0), 0) ?? 0;

  const telephonyActive = account?.capabilities?.telephony.callingEnabled === true;
  const groqReady = account?.capabilities?.groq.configured === true;

  const checklist = [
    {
      label: 'Add your business information',
      done: Boolean(workspace?.name),
      href: '/app/workspace',
      hint: 'Name, services, hours and approved answers',
    },
    {
      label: 'Create an AI agent',
      done: (agents?.length ?? 0) > 0,
      href: '/app/agents/new',
      hint: 'Identity, knowledge and escalation rules',
    },
    {
      label: 'Run a transcription test',
      done: (account?.usage?.transcriptionCount ?? 0) > 0,
      href: '/app/voice-lab',
      hint: 'Upload audio or record with your microphone',
    },
    {
      label: 'Hold a test conversation',
      done: (account?.usage?.chatRequests ?? 0) > 0,
      href: '/app/voice-lab',
      hint: 'Text or transcribed speech, answered by your agent',
    },
  ];
  const completedSteps = checklist.filter((step) => step.done).length;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back${account?.displayName ? `, ${account.displayName.split(' ')[0]}` : ''}`}
        description="Live totals from your workspace. Test conversations and telephone calls are counted separately."
        actions={
          <>
            <Link href="/app/voice-lab">
              <Button variant="secondary">
                <Mic className="h-4 w-4" aria-hidden />
                Voice lab
              </Button>
            </Link>
            <Link href="/app/agents/new">
              <Button>
                <Plus className="h-4 w-4" aria-hidden />
                New agent
              </Button>
            </Link>
          </>
        }
      />

      {account && !account.serverMetering && (
        <Alert tone="warning" title="Usage metering is offline" className="mb-5">
          Server credentials are missing, so usage counters and plan limits are unavailable. The numbers below only reflect
          data readable by your browser session.
        </Alert>
      )}

      {!groqReady && account && (
        <Alert tone="info" title="AI provider not configured" className="mb-5">
          Speech-to-text and AI replies stay disabled until <code className="rounded bg-sky-100 px-1">GROQ_API_KEY</code> is
          set in the server environment. No placeholder responses are generated.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="AI agents"
          value={agentsLoading ? '—' : (agents?.length ?? 0)}
          hint={`${activeAgents.length} active${account?.limits?.agents != null ? ` · plan allows ${account.limits.agents}` : ''}`}
          icon={<Bot className="h-4 w-4" />}
        />
        <StatCard
          label="Test conversations"
          value={accountLoading ? '—' : (account?.usage?.chatRequests ?? 0)}
          hint="Text test turns this month — not phone calls"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="Transcriptions"
          value={accountLoading ? '—' : (account?.usage?.transcriptionCount ?? 0)}
          hint={
            account?.usage
              ? `${Math.round(account.usage.transcriptionSeconds / 60)} audio minutes this month`
              : 'Server metering required'
          }
          icon={<Mic className="h-4 w-4" />}
        />
        <StatCard
          label="Estimated usage cost"
          value={accountLoading ? '—' : formatUsd(account?.usage?.estimatedCostUsd ?? 0)}
          hint="Provider list-price estimate, not an invoice"
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader
            title="Telephone calls"
            description="Call records appear here only after telephony is configured and a call actually happens."
            action={
              <Badge tone={telephonyActive ? 'success' : 'neutral'}>
                {telephonyActive ? 'Active' : 'Not activated'}
              </Badge>
            }
          />
          <div className="card-body">
            {!telephonyActive ? (
              <div className="rounded-xl border border-dashed border-line bg-canvas/70 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-muted shadow-sm">
                    <PhoneOff className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-950">Telephone calling has not been activated</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">
                      The Twilio adapter, webhooks and call records are implemented but disabled. Configure{' '}
                      <code className="rounded bg-white px-1 text-[12px]">TWILIO_*</code> variables and verify a number
                      before enabling calls. No test calls are simulated.
                    </p>
                    <Link href="/app/calls" className="mt-3 inline-block text-[13px] font-semibold text-brand-600 hover:underline">
                      View call history requirements →
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Total calls" value={callsLoading ? '—' : totalCalls} icon={<PhoneCall className="h-3.5 w-3.5" />} />
                <Metric label="Completed" value={callsLoading ? '—' : completedCalls} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} />
                <Metric label="Failed" value={callsLoading ? '—' : failedCalls} icon={<XCircle className="h-3.5 w-3.5 text-red-600" />} />
                <Metric label="Talk time" value={callsLoading ? '—' : formatDuration(totalCallSeconds)} icon={<Clock3 className="h-3.5 w-3.5" />} />
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Getting started" description={`${completedSteps} of ${checklist.length} steps complete`} />
          <div className="card-body space-y-1.5">
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${(completedSteps / checklist.length) * 100}%` }}
              />
            </div>
            {checklist.map((step) => (
              <Link
                key={step.label}
                href={step.href}
                className="flex items-start gap-3 rounded-lg px-1.5 py-2 transition-colors hover:bg-canvas"
              >
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-500/50" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className={`block text-[13px] font-medium ${step.done ? 'text-muted line-through' : 'text-ink-900'}`}>
                    {step.label}
                  </span>
                  <span className="block text-[11.5px] text-muted">{step.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Your agents"
            description="Status comes from your saved agent records."
            action={
              <Link href="/app/agents" className="text-[12px] font-semibold text-brand-600 hover:underline">
                Manage
              </Link>
            }
          />
          {agentsLoading ? (
            <div className="card-body">
              <SkeletonLines count={4} />
            </div>
          ) : agents && agents.length > 0 ? (
            <ul className="divide-y divide-line">
              {agents.slice(0, 4).map((agent) => (
                <li key={agent.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Bot className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{agent.name}</p>
                    <p className="truncate text-[11.5px] text-muted">
                      {agent.language} · updated {formatDateTime(agent.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={agent.status === 'active' ? 'success' : 'neutral'}>{agent.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Bot className="h-5 w-5" />}
              title="No agents yet"
              description="Create your first agent to start testing conversations."
              action={
                <Link href="/app/agents/new">
                  <Button small>New agent</Button>
                </Link>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Recent activity" description="Latest calls and conversation tests." />
          {callsLoading ? (
            <div className="card-body">
              <SkeletonLines count={4} />
            </div>
          ) : calls && calls.length > 0 ? (
            <ul className="divide-y divide-line">
              {calls.slice(0, 5).map((call) => (
                <li key={call.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-ink-600">
                    <Activity className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">
                      {call.direction === 'outbound' ? 'Outbound call' : 'Inbound call'} · {call.agentName || 'No agent'}
                    </p>
                    <p className="truncate text-[11.5px] text-muted">
                      {formatDateTime(call.createdAt)} · {formatDuration(call.durationSeconds)}
                    </p>
                  </div>
                  <Badge tone={call.status === 'completed' ? 'success' : call.status === 'failed' ? 'danger' : 'neutral'}>
                    {call.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<PhoneCall className="h-5 w-5" />}
              title="No call activity"
              description={
                telephonyActive
                  ? 'Calls appear here once your provider reports them.'
                  : 'Telephone calling is not activated, so there are no call records to show.'
              }
              action={
                <Link href="/app/voice-lab">
                  <Button variant="secondary" small>
                    Run a test conversation
                  </Button>
                </Link>
              }
            />
          )}
        </Card>
      </div>

      {!workspaceLoading && !workspace?.name && (
        <Card className="mt-4">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Building2 className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-950">Add your business information</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  Agents answer only from your stored facts. Without them, every unknown becomes a human handoff.
                </p>
              </div>
            </div>
            <Link href="/app/workspace">
              <Button variant="secondary">Set up workspace</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold text-ink-950">{value}</p>
    </div>
  );
}
