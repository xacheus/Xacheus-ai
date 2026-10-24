'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  PhoneCall,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Select,
  SkeletonLines,
  StatCard,
  Tabs,
  cn,
} from '@/components/ui';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { formatUsd } from '@/lib/pricing';
import { PLANS } from '@/lib/plans';

type Tab = 'overview' | 'users' | 'agents' | 'providers' | 'errors';

interface Overview {
  counts: { users: number; agents: number; calls: number; completedCalls: number; failedCalls: number; openErrors: number };
  planDistribution: Record<string, number>;
  usageThisMonth: {
    month: string;
    transcriptionSeconds: number;
    chatRequests: number;
    callMinutes: number;
    estimatedCostUsd: number;
  };
  providers: {
    groq: { configured: boolean; textModel: string; whisperModel: string };
    telephony: { configured: boolean; callingEnabled: boolean; phoneNumber: string | null };
    appCheck: { configured: boolean };
  };
  infrastructure: { firebaseAdmin: string; serverMetering: boolean };
}

interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  isAdmin: boolean;
  planId: string;
  planStatus: string;
}

interface AdminAgent {
  id: string;
  ownerId: string;
  name: string;
  status: 'active' | 'inactive';
  language: string;
  businessName: string;
  updatedAt: string | null;
}

interface ProviderStatus {
  providers: Overview['providers'];
  infrastructure: { firebaseAdmin: string; appCheckEnforced: boolean };
  configurationChecklist: Array<{ key: string; required: boolean; present: boolean; scope: string; value?: string }>;
  models: { available: string[]; textModelPresent: boolean | null; whisperModelPresent: boolean | null } | null;
}

interface ErrorEntry {
  id: string;
  scope: string;
  message: string;
  code: string | null;
  status: number | null;
  createdAt: string | null;
}

export default function AdminPage() {
  const { account, accountLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [busyAgent, setBusyAgent] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(
    async (target: Tab) => {
      setLoading(true);
      setError(null);
      try {
        if (target === 'overview' || target === 'providers') {
          const data = await apiFetch<Overview>('/api/admin/overview');
          setOverview(data);
        }
        if (target === 'users') {
          const data = await apiFetch<{ users: AdminUser[] }>('/api/admin/users');
          setUsers(data.users);
        }
        if (target === 'agents') {
          const data = await apiFetch<{ agents: AdminAgent[] }>('/api/admin/agents');
          setAgents(data.agents);
        }
        if (target === 'providers') {
          const data = await apiFetch<ProviderStatus>('/api/admin/providers');
          setProviders(data);
        }
        if (target === 'errors') {
          const data = await apiFetch<{ errors: ErrorEntry[]; notice?: string }>('/api/admin/errors');
          setErrors(data.errors);
          if (data.notice) setNotice(data.notice);
        }
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (account?.isAdmin) void load(tab);
  }, [tab, account?.isAdmin, load]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(term) ||
        user.displayName.toLowerCase().includes(term) ||
        user.uid.includes(term),
    );
  }, [users, search]);

  async function changePlan(user: AdminUser, planId: string) {
    setBusyPlan(user.uid);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${user.uid}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({ planId, note: 'Assigned from admin dashboard' }),
      });
      setUsers((current) => current.map((entry) => (entry.uid === user.uid ? { ...entry, planId } : entry)));
      setNotice(`${user.email || user.uid} moved to the ${planId} plan. No payment was taken.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyPlan(null);
    }
  }

  async function toggleAgent(agent: AdminAgent) {
    setBusyAgent(`${agent.ownerId}:${agent.id}`);
    setError(null);
    setNotice(null);
    try {
      const nextStatus = agent.status === 'active' ? 'inactive' : 'active';
      await apiFetch('/api/admin/agents', {
        method: 'POST',
        body: JSON.stringify({
          ownerId: agent.ownerId,
          agentId: agent.id,
          status: nextStatus,
          reason: 'Admin moderation',
        }),
      });
      setAgents((current) => current.map((entry) => (entry.id === agent.id ? { ...entry, status: nextStatus } : entry)));
      setNotice(`Agent ${agent.name} set to ${nextStatus}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyAgent(null);
    }
  }

  async function verifyModels() {
    setVerifying(true);
    setError(null);
    try {
      const data = await apiFetch<ProviderStatus>('/api/admin/providers?verify=1');
      setProviders(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setVerifying(false);
    }
  }

  if (accountLoading) {
    return (
      <div className="card card-body">
        <SkeletonLines count={5} />
      </div>
    );
  }

  if (!account?.isAdmin) {
    return (
      <div>
        <PageHeader eyebrow="Administration" title="Administrator access required" />
        <Card>
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="This area is restricted"
            description="Administrator rights are granted only through a server-verified Firebase custom claim. If you need access, ask the platform owner to grant it."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Platform overview"
        description="Users, agents, providers and system health. Provider secrets are never displayed."
        actions={
          <Button variant="secondary" onClick={() => void load(tab)} loading={loading}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert tone="error" title="Request failed" className="mb-4">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="success" className="mb-4">
          {notice}
        </Alert>
      )}

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'users', label: 'Users' },
            { id: 'agents', label: 'Agents' },
            { id: 'providers', label: 'Providers' },
            { id: 'errors', label: 'Errors' },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Users" value={overview?.counts.users ?? '—'} icon={<Users className="h-4 w-4" />} hint="Firestore profiles" />
            <StatCard label="AI agents" value={overview?.counts.agents ?? '—'} icon={<Bot className="h-4 w-4" />} hint="Across all workspaces" />
            <StatCard label="Calls" value={overview?.counts.calls ?? '—'} icon={<PhoneCall className="h-4 w-4" />} hint={`${overview?.counts.completedCalls ?? 0} completed`} />
            <StatCard
              label="Errors (24h)"
              value={overview?.counts.openErrors ?? '—'}
              icon={<AlertTriangle className="h-4 w-4" />}
              tone={overview && overview.counts.openErrors > 0 ? 'danger' : 'success'}
              hint="Server-side failures logged"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Platform usage this month" description={overview?.usageThisMonth.month || '—'} />
              <div className="card-body space-y-3">
                <Row label="Speech-to-text audio" value={`${Math.round((overview?.usageThisMonth.transcriptionSeconds ?? 0) / 60)} min`} />
                <Row label="Test conversation turns" value={(overview?.usageThisMonth.chatRequests ?? 0).toLocaleString('en-US')} />
                <Row label="Telephone minutes" value={`${overview?.usageThisMonth.callMinutes ?? 0} min`} />
                <Row label="Estimated provider cost" value={formatUsd(overview?.usageThisMonth.estimatedCostUsd ?? 0)} />
                <p className="pt-2 text-[11.5px] leading-relaxed text-muted">
                  Aggregated from per-user monthly counters. Estimates use provider list prices and are not invoices.
                </p>
              </div>
            </Card>

            <Card>
              <CardHeader title="Subscriptions" description="Plan assignments are recorded server-side." />
              <div className="card-body space-y-3">
                {PLANS.map((plan) => {
                  const count = overview?.planDistribution[plan.id] ?? 0;
                  const total = Object.values(overview?.planDistribution || {}).reduce((sum, value) => sum + value, 0) || 1;
                  return (
                    <div key={plan.id}>
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="font-medium text-ink-800">{plan.name}</span>
                        <span className="tabular-nums text-muted">{count}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
                <p className="pt-2 text-[11.5px] text-muted">
                  No payment provider is connected. Every subscription uses billing provider <code className="rounded bg-canvas px-1">none</code>.
                </p>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="System health" />
            <div className="card-body grid gap-3 sm:grid-cols-3">
              <HealthItem
                label="Firebase Admin"
                ok={overview?.infrastructure.serverMetering === true}
                okText="Ready"
                failText="Credentials missing"
              />
              <HealthItem
                label="Groq AI provider"
                ok={overview?.providers.groq.configured === true}
                okText="Configured"
                failText="GROQ_API_KEY missing"
              />
              <HealthItem
                label="Telephony"
                ok={overview?.providers.telephony.callingEnabled === true}
                okText="Calling enabled"
                failText="Not activated"
              />
            </div>
          </Card>
        </div>
      )}

      {tab === 'users' && (
        <Card>
          <CardHeader
            title="Users"
            description="Directory from Firebase Auth, merged with server-side plan data."
            action={
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search email, name or uid"
                className="input h-9 w-56 text-[12.5px]"
                aria-label="Search users"
              />
            }
          />
          {loading && users.length === 0 ? (
            <div className="card-body">
              <SkeletonLines count={6} />
            </div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState icon={<Users className="h-5 w-5" />} title="No users found" description="Try a different search term." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Verified</th>
                    <th>Last sign-in</th>
                    <th>Role</th>
                    <th>Plan</th>
                    <th className="text-right">Assign plan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.uid}>
                      <td>
                        <p className="text-[13px] font-medium text-ink-950">{user.displayName || '—'}</p>
                        <p className="text-[11.5px] text-muted">{user.email || user.uid}</p>
                      </td>
                      <td>
                        {user.emailVerified ? (
                          <Badge tone="success">Yes</Badge>
                        ) : (
                          <Badge tone="warning">No</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-[12px] text-muted">
                        {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : '—'}
                      </td>
                      <td>{user.isAdmin ? <Badge tone="brand">Admin</Badge> : <span className="text-[12px] text-muted">User</span>}</td>
                      <td className="capitalize">
                        <Badge tone="neutral">{user.planId}</Badge>
                      </td>
                      <td className="text-right">
                        <Select
                          className="ml-auto h-8 w-36 text-[12px]"
                          value={user.planId}
                          disabled={busyPlan === user.uid}
                          onChange={(event) => void changePlan(user, event.target.value)}
                          aria-label={`Plan for ${user.email}`}
                        >
                          {PLANS.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'agents' && (
        <Card>
          <CardHeader title="Agents" description="Moderation view across workspaces. Owner identifiers are shown for accountability." />
          {loading && agents.length === 0 ? (
            <div className="card-body">
              <SkeletonLines count={6} />
            </div>
          ) : agents.length === 0 ? (
            <EmptyState icon={<Bot className="h-5 w-5" />} title="No agents yet" description="Agents appear here once customers create them." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Owner</th>
                    <th>Language</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={`${agent.ownerId}-${agent.id}`}>
                      <td>
                        <p className="text-[13px] font-medium text-ink-950">{agent.name}</p>
                        <p className="text-[11.5px] text-muted">{agent.businessName || 'No business name'}</p>
                      </td>
                      <td className="max-w-[160px] truncate font-mono text-[11px] text-muted">{agent.ownerId}</td>
                      <td className="text-[12.5px]">{agent.language}</td>
                      <td>
                        <Badge tone={agent.status === 'active' ? 'success' : 'neutral'}>{agent.status}</Badge>
                      </td>
                      <td className="text-right">
                        <Button
                          variant="secondary"
                          small
                          loading={busyAgent === `${agent.ownerId}:${agent.id}`}
                          onClick={() => void toggleAgent(agent)}
                        >
                          {agent.status === 'active' ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'providers' && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Configuration status"
              description="Presence only — values are never returned to the browser."
              action={
                <Button variant="secondary" small onClick={verifyModels} loading={verifying}>
                  Verify Groq models
                </Button>
              }
            />
            {loading && !providers ? (
              <div className="card-body">
                <SkeletonLines count={6} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Variable</th>
                      <th>Scope</th>
                      <th>Required</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers?.configurationChecklist.map((item) => (
                      <tr key={item.key}>
                        <td className="font-mono text-[12px]">{item.key}</td>
                        <td className="text-[12px] capitalize text-muted">{item.scope}</td>
                        <td className="text-[12px]">{item.required ? 'Yes' : 'Optional'}</td>
                        <td>
                          {item.present ? (
                            <Badge tone="success">
                              <CheckCircle2 className="h-3 w-3" aria-hidden />
                              Set
                            </Badge>
                          ) : (
                            <Badge tone={item.required ? 'danger' : 'neutral'}>
                              <XCircle className="h-3 w-3" aria-hidden />
                              Missing
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Model availability" description="Verified directly against the configured Groq account." />
            <div className="card-body space-y-3">
              {!providers?.models ? (
                <p className="text-[12.5px] text-muted">
                  Press “Verify Groq models” to query the provider. This makes one live request to the models endpoint.
                </p>
              ) : providers.models.available.length === 0 ? (
                <Alert tone="warning" title="No models returned">
                  The provider did not return a model list. Check that GROQ_API_KEY is valid and that the server can reach the
                  provider.
                </Alert>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <HealthItem
                      label={`Text model · ${overview?.providers.groq.textModel || 'unset'}`}
                      ok={providers.models.textModelPresent === true}
                      okText="Available"
                      failText="Not in account"
                    />
                    <HealthItem
                      label={`Whisper · ${overview?.providers.groq.whisperModel || 'unset'}`}
                      ok={providers.models.whisperModelPresent === true}
                      okText="Available"
                      failText="Not in account"
                    />
                  </div>
                  <details className="rounded-lg border border-line bg-canvas/60 px-3 py-2">
                    <summary className="cursor-pointer text-[12.5px] font-medium text-ink-800">
                      Available models ({providers.models.available.length})
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {providers.models.available.map((model) => (
                        <span key={model} className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink-700">
                          {model}
                        </span>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Usage limit configuration" description="Server defaults per plan. Change with environment configuration." />
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Agents</th>
                    <th>STT seconds</th>
                    <th>Test turns</th>
                    <th>Call minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {PLANS.map((plan) => (
                    <tr key={plan.id}>
                      <td className="font-medium">{plan.name}</td>
                      <td className="tabular-nums">{plan.limits?.agents ?? 'Custom'}</td>
                      <td className="tabular-nums">{plan.limits?.transcriptionSecondsPerMonth ?? 'Custom'}</td>
                      <td className="tabular-nums">{plan.limits?.chatRequestsPerMonth ?? 'Custom'}</td>
                      <td className="tabular-nums">{plan.limits?.callMinutesPerMonth ?? 'Custom'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-5 py-3 text-[11.5px] leading-relaxed text-muted">
              Override the free tier with <code className="rounded bg-canvas px-1">STARTER_TRANSCRIPTION_SECONDS</code>,{' '}
              <code className="rounded bg-canvas px-1">STARTER_CHAT_REQUESTS</code> and{' '}
              <code className="rounded bg-canvas px-1">STARTER_AGENTS</code>, or supply a full catalogue through{' '}
              <code className="rounded bg-canvas px-1">PLAN_CONFIG_JSON</code>.
            </div>
          </Card>
        </div>
      )}

      {tab === 'errors' && (
        <Card>
          <CardHeader title="Recent server errors" description="Last 50 entries. Messages are truncated and contain no provider payloads." />
          {loading && errors.length === 0 ? (
            <div className="card-body">
              <SkeletonLines count={5} />
            </div>
          ) : errors.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-5 w-5" />}
              title="No errors recorded"
              description="Either nothing has failed, or error logging has not written anything yet."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Scope</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-[12px] text-muted">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="text-[12px]">{entry.scope}</td>
                      <td className="tabular-nums text-[12px]">{entry.status ?? '—'}</td>
                      <td className="max-w-[420px] truncate text-[12.5px]" title={entry.message}>
                        {entry.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card className="mt-4">
        <div className="flex items-start gap-3 p-4">
          <ServerCog className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <p className="text-[11.5px] leading-relaxed text-muted">
            Administrator access is verified server-side from a Firebase custom claim on every request. Do not grant the claim
            to customer accounts. Provider keys are read from server environment variables and are never included in API
            responses, page markup or logs.
          </p>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/70 pb-2 last:border-0 last:pb-0">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="text-[13px] font-medium tabular-nums text-ink-900">{value}</span>
    </div>
  );
}

function HealthItem({
  label,
  ok,
  okText,
  failText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-line bg-canvas/50 px-3.5 py-3">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium text-ink-900">{label}</p>
        <p className={cn('text-[11.5px]', ok ? 'text-emerald-700' : 'text-amber-700')}>{ok ? okText : failText}</p>
      </div>
    </div>
  );
}
