'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Bot, MoreHorizontal, Pause, Play, Plus, Trash2, Wand2 } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useAgents, type AgentDoc, formatDateTime } from '@/lib/client/firestore-data';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  SkeletonLines,
  Tabs,
  cn,
} from '@/components/ui';
import { apiFetch, errorMessage } from '@/lib/client/api';

type Filter = 'all' | 'active' | 'inactive';

export default function AgentsPage() {
  const { user, account } = useAuth();
  const { data: agents, loading, error } = useAgents(user?.uid);
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingDelete, setPendingDelete] = useState<AgentDoc | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!agents) return [];
    if (filter === 'all') return agents;
    return agents.filter((agent) => agent.status === filter);
  }, [agents, filter]);

  const counts = useMemo(
    () => ({
      all: agents?.length ?? 0,
      active: agents?.filter((agent) => agent.status === 'active').length ?? 0,
      inactive: agents?.filter((agent) => agent.status === 'inactive').length ?? 0,
    }),
    [agents],
  );

  async function toggleStatus(agent: AgentDoc) {
    setBusyId(agent.id);
    setActionError(null);
    try {
      await apiFetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: agent.status === 'active' ? 'inactive' : 'active' }),
      });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    setActionError(null);
    try {
      await apiFetch(`/api/agents/${pendingDelete.id}`, { method: 'DELETE' });
      setPendingDelete(null);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const limit = account?.limits?.agents ?? null;
  const atLimit = limit !== null && (agents?.length ?? 0) >= limit;

  return (
    <div>
      <PageHeader
        eyebrow="Agent management"
        title="AI voice agents"
        description="Each agent has its own identity, knowledge and escalation rules. Agents are isolated to your workspace."
        actions={
          <>
            <Link href="/app/voice-lab">
              <Button variant="secondary">
                <Wand2 className="h-4 w-4" aria-hidden />
                Voice lab
              </Button>
            </Link>
            <Link href="/app/agents/new" aria-disabled={atLimit}>
              <Button disabled={atLimit}>
                <Plus className="h-4 w-4" aria-hidden />
                New agent
              </Button>
            </Link>
          </>
        }
      />

      {actionError && (
        <Alert tone="error" title="That action did not complete" className="mb-4">
          {actionError}
        </Alert>
      )}

      {atLimit && (
        <Alert tone="warning" title={`Your ${account?.planName} plan allows ${limit} agent${limit === 1 ? '' : 's'}.`} className="mb-4">
          Deactivate and delete an agent, or upgrade your plan. Limits are enforced on the server.
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'inactive', label: 'Inactive', count: counts.inactive },
          ]}
        />
        <p className="text-xs text-muted">
          {limit === null ? 'Custom agent allowance' : `${counts.all} of ${limit} agents used`}
        </p>
      </div>

      {error && <Alert tone="error" title="Could not load agents">{error}</Alert>}

      {loading && !agents && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Card key={index} className="card-body">
              <SkeletonLines count={4} />
            </Card>
          ))}
        </div>
      )}

      {!loading && agents && agents.length === 0 && (
        <Card>
          <EmptyState
            icon={<Bot className="h-5 w-5" />}
            title="Create your first AI agent"
            description="An agent combines your business facts, tone and escalation rules into a consistent assistant you can test immediately."
            action={
              <Link href="/app/agents/new">
                <Button>
                  <Plus className="h-4 w-4" aria-hidden />
                  New agent
                </Button>
              </Link>
            }
          />
        </Card>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((agent) => (
            <Card key={agent.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Bot className="h-4 w-4" aria-hidden />
                    </span>
                    <Badge tone={agent.status === 'active' ? 'success' : 'neutral'}>{agent.status}</Badge>
                  </div>
                  <h2 className="mt-3 truncate text-[15px] font-semibold text-ink-950">{agent.name}</h2>
                  <p className="mt-1 line-clamp-2 min-h-[34px] text-[13px] leading-relaxed text-muted">
                    {agent.purpose || 'No purpose set yet.'}
                  </p>
                </div>
                <span className="relative group">
                  <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-canvas" aria-label="Agent options">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-3 border-y border-line px-5 py-3 text-[11.5px]">
                <div>
                  <dt className="text-muted">Language</dt>
                  <dd className="mt-0.5 font-medium text-ink-800">{agent.language}</dd>
                </div>
                <div>
                  <dt className="text-muted">Voice</dt>
                  <dd className="mt-0.5 font-medium capitalize text-ink-800">{agent.voiceProvider}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted">Updated</dt>
                  <dd className="mt-0.5 font-medium text-ink-800">{formatDateTime(agent.updatedAt)}</dd>
                </div>
              </dl>

              <div className="mt-auto flex flex-wrap items-center gap-2 p-4">
                <Link href={`/app/agents/${agent.id}`} className="flex-1">
                  <Button variant="secondary" small className="w-full">
                    Edit agent
                  </Button>
                </Link>
                <Link href={`/app/voice-lab?agent=${agent.id}`}>
                  <Button variant="ghost" small>
                    <Wand2 className="h-3.5 w-3.5" aria-hidden />
                    Test
                  </Button>
                </Link>
                <button
                  type="button"
                  onClick={() => void toggleStatus(agent)}
                  disabled={busyId === agent.id}
                  className={cn(
                    'rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink-800',
                    busyId === agent.id && 'opacity-50',
                  )}
                  aria-label={agent.status === 'active' ? `Deactivate ${agent.name}` : `Activate ${agent.name}`}
                  title={agent.status === 'active' ? 'Deactivate' : 'Activate'}
                >
                  {agent.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(agent)}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${agent.name}`}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this agent?"
        description={`"${pendingDelete?.name ?? ''}" will be removed permanently. Existing call records keep their stored agent name.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Keep agent
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={busyId === pendingDelete?.id}>
              Delete agent
            </Button>
          </>
        }
      >
        <p>This cannot be undone. Usage already recorded against this agent remains in your usage history.</p>
      </Modal>
    </div>
  );
}
