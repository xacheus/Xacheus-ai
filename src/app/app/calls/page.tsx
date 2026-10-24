'use client';

import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, FileText, PhoneCall, PhoneOff, ShieldAlert, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { useAgents, useCalls, formatDateTime, formatDuration, type CallDoc } from '@/lib/client/firestore-data';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SkeletonLines,
  Tabs,
} from '@/components/ui';
import { ApiClientError, apiFetch, errorMessage } from '@/lib/client/api';

type Filter = 'all' | 'completed' | 'failed' | 'active';

const statusTone = (status: string) => {
  if (status === 'completed') return 'success' as const;
  if (['failed', 'busy', 'no-answer', 'canceled'].includes(status)) return 'danger' as const;
  if (['queued', 'ringing', 'in-progress'].includes(status)) return 'info' as const;
  return 'neutral' as const;
};

export default function CallsPage() {
  const { user, account } = useAuth();
  const { data: calls, loading, error } = useCalls(user?.uid, 100);
  const { data: agents } = useAgents(user?.uid);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<CallDoc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeAgents = (agents || []).filter((agent) => agent.status === 'active');
  const [callOpen, setCallOpen] = useState(false);
  const [callForm, setCallForm] = useState({ agentId: '', toNumber: '', consent: false });
  const [callBusy, setCallBusy] = useState(false);
  const [callError, setCallError] = useState<{ message: string; hint?: string } | null>(null);
  const [callResult, setCallResult] = useState<string | null>(null);

  const telephonyActive = account?.capabilities?.telephony.callingEnabled === true;

  const filtered = useMemo(() => {
    if (!calls) return [];
    switch (filter) {
      case 'completed':
        return calls.filter((call) => call.status === 'completed');
      case 'failed':
        return calls.filter((call) => ['failed', 'busy', 'no-answer', 'canceled'].includes(call.status));
      case 'active':
        return calls.filter((call) => ['queued', 'ringing', 'in-progress'].includes(call.status));
      default:
        return calls;
    }
  }, [calls, filter]);

  async function submitOutboundCall(event: React.FormEvent) {
    event.preventDefault();
    setCallError(null);
    setCallResult(null);
    if (!callForm.consent) {
      setCallError({ message: 'Confirm that the recipient consented to this call.' });
      return;
    }
    setCallBusy(true);
    try {
      const result = await apiFetch<{ call: { id: string; status: string } }>('/api/calls/outbound', {
        method: 'POST',
        body: JSON.stringify({
          agentId: callForm.agentId,
          toNumber: callForm.toNumber.trim(),
          consentConfirmed: true,
        }),
      });
      setCallResult(`Call requested (${result.call.status}). Reference ${result.call.id}.`);
      setCallForm((previous) => ({ ...previous, toNumber: '', consent: false }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCallError({ message: err.message, hint: err.hint });
      } else {
        setCallError({ message: errorMessage(err) });
      }
    } finally {
      setCallBusy(false);
    }
  }

  async function deleteCall() {
    if (!selected) return;
    setDeleting(true);
    setActionError(null);
    try {
      await apiFetch(`/api/calls/${selected.id}`, { method: 'DELETE' });
      setSelected(null);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Telephony"
        title="Call history"
        description="Real telephone calls only. Test conversations in the voice lab are never written here."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setCallOpen(true);
              setCallResult(null);
              setCallError(null);
              setCallForm((previous) => ({
                ...previous,
                agentId: previous.agentId || activeAgents[0]?.id || '',
              }));
            }}
            disabled={!telephonyActive}
            title={telephonyActive ? 'Place a monitored outbound call' : 'Telephony is not configured'}
          >
            <PhoneCall className="h-4 w-4" aria-hidden />
            Place a call
          </Button>
        }
      />

      {!telephonyActive && (
        <Card className="mb-5">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
              <PhoneOff className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-ink-950">Telephone calling has not been activated</h2>
                <Badge tone="neutral">Inactive</Badge>
              </div>
              <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
                The telephony adapter and webhooks are implemented, but no provider is configured on this deployment. No
                numbers are assigned, no calls are placed and no call records are fabricated.
              </p>
              <div className="mt-3 grid gap-2 text-[12px] text-ink-700 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-canvas/60 px-3 py-2">
                  <p className="font-semibold">1 · Provider account</p>
                  <p className="mt-0.5 text-muted">
                    Verify a Twilio account and a country-capable number in the destinations you need.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-canvas/60 px-3 py-2">
                  <p className="font-semibold">2 · Server variables</p>
                  <p className="mt-0.5 text-muted">
                    Set <code className="rounded bg-white px-1">TWILIO_ACCOUNT_SID</code>,{' '}
                    <code className="rounded bg-white px-1">TWILIO_AUTH_TOKEN</code>,{' '}
                    <code className="rounded bg-white px-1">TWILIO_PHONE_NUMBER</code> and{' '}
                    <code className="rounded bg-white px-1">TWILIO_WEBHOOK_BASE_URL</code>.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-canvas/60 px-3 py-2">
                  <p className="font-semibold">3 · Voice gateway</p>
                  <p className="mt-0.5 text-muted">
                    Deploy a real-time media gateway (<code className="rounded bg-white px-1">VOICE_STREAM_URL</code>) to
                    bridge audio to speech recognition and the model.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-canvas/60 px-3 py-2">
                  <p className="font-semibold">4 · Enable after testing</p>
                  <p className="mt-0.5 text-muted">
                    Set <code className="rounded bg-white px-1">TELEPHONY_CALLING_ENABLED=true</code> only after an
                    end-to-end test with a verified number.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/app/voice-lab">
                  <Button variant="secondary" small>
                    Use the voice lab instead
                  </Button>
                </Link>
                <Link href="/app/settings">
                  <Button variant="ghost" small>
                    Retention & privacy
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      {telephonyActive && (
        <Alert tone="info" className="mb-5" title="Consent and limits apply">
          Outbound calls require a verified email address, confirmed recipient consent and remaining minutes on your plan.
          Calling limits are enforced on the server.
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: 'All', count: calls?.length ?? 0 },
            { id: 'completed', label: 'Completed', count: calls?.filter((call) => call.status === 'completed').length ?? 0 },
            {
              id: 'failed',
              label: 'Failed',
              count: calls?.filter((call) => ['failed', 'busy', 'no-answer', 'canceled'].includes(call.status)).length ?? 0,
            },
            {
              id: 'active',
              label: 'In progress',
              count: calls?.filter((call) => ['queued', 'ringing', 'in-progress'].includes(call.status)).length ?? 0,
            },
          ]}
        />
        <p className="text-xs text-muted">Audio recordings are not stored by default.</p>
      </div>

      {error && <Alert tone="error" title="Could not load call history">{error}</Alert>}

      <Card className="overflow-hidden">
        {loading && !calls ? (
          <div className="card-body">
            <SkeletonLines count={6} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<PhoneCall className="h-5 w-5" />}
            title={calls && calls.length > 0 ? 'No calls match this filter' : 'No telephone calls yet'}
            description={
              calls && calls.length > 0
                ? 'Try a different status filter.'
                : telephonyActive
                  ? 'Records appear after your provider reports a call. Test conversations live in the voice lab.'
                  : 'Calling is not activated on this deployment, so there is nothing to show.'
            }
            action={
              <Link href="/app/voice-lab">
                <Button variant="secondary" small>
                  Go to voice lab
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Call</th>
                    <th>Agent</th>
                    <th>Direction</th>
                    <th>Start</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Outcome</th>
                    <th className="text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((call) => (
                    <tr key={call.id} className="hover:bg-canvas/60">
                      <td className="font-mono text-[12px] text-muted">{call.id.slice(0, 10)}…</td>
                      <td className="max-w-[160px] truncate">{call.agentName || '—'}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] capitalize">
                          {call.direction === 'outbound' ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-brand-600" aria-hidden />
                          ) : (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                          )}
                          {call.direction}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">{formatDateTime(call.startTime || call.createdAt)}</td>
                      <td className="whitespace-nowrap tabular-nums">{formatDuration(call.durationSeconds)}</td>
                      <td>
                        <Badge tone={statusTone(call.status)}>{call.status}</Badge>
                      </td>
                      <td className="max-w-[140px] truncate text-[12.5px] capitalize">{call.outcome || '—'}</td>
                      <td className="text-right">
                        <Button variant="ghost" small onClick={() => setSelected(call)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-line md:hidden">
              {filtered.map((call) => (
                <li key={call.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(call)}
                    className="w-full px-4 py-3.5 text-left transition-colors hover:bg-canvas/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-950">
                          {call.direction === 'outbound' ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-brand-600" aria-hidden />
                          ) : (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                          )}
                          {call.agentName || 'No agent'}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-muted">{formatDateTime(call.startTime || call.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={statusTone(call.status)}>{call.status}</Badge>
                        <span className="text-[11.5px] tabular-nums text-muted">{formatDuration(call.durationSeconds)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setActionError(null);
        }}
        title="Call details"
        description={selected ? `${selected.direction} · ${formatDateTime(selected.startTime || selected.createdAt)}` : undefined}
        size="lg"
        footer={
          <>
            <Button
              variant="danger"
              onClick={deleteCall}
              loading={deleting}
              disabled={!selected}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete record
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSelected(null);
                setActionError(null);
              }}
            >
              Close
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            {actionError && <Alert tone="error">{actionError}</Alert>}

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Status" value={<Badge tone={statusTone(selected.status)}>{selected.status}</Badge>} />
              <DetailRow label="Duration" value={formatDuration(selected.durationSeconds)} />
              <DetailRow label="Agent" value={selected.agentName || '—'} />
              <DetailRow label="Outcome" value={selected.outcome || '—'} />
              <DetailRow label="From" value={selected.from || '—'} />
              <DetailRow label="To" value={selected.to || '—'} />
              <DetailRow label="Call ID" value={<span className="font-mono text-[11.5px]">{selected.id}</span>} />
              <DetailRow label="Started" value={formatDateTime(selected.startTime || selected.createdAt)} />
            </div>

            {selected.failureReason && (
              <Alert tone="error" title="Failure reported by provider">
                {selected.failureReason}
              </Alert>
            )}

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink-800">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Summary
              </p>
              {selected.summary ? (
                <p className="rounded-lg border border-line bg-canvas/60 p-3 text-[13px] leading-relaxed">{selected.summary}</p>
              ) : (
                <p className="rounded-lg border border-dashed border-line bg-canvas/40 p-3 text-[12.5px] text-muted">
                  No AI summary is stored for this call. Summaries are generated only when a transcript exists.
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink-800">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Transcript
              </p>
              {selected.transcript ? (
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas/60 p-3 font-sans text-[12.5px] leading-relaxed">
                  {selected.transcript}
                </pre>
              ) : (
                <p className="rounded-lg border border-dashed border-line bg-canvas/40 p-3 text-[12.5px] text-muted">
                  No transcript stored. Live call transcription requires a deployed media gateway.
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-muted">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Deleting this record removes the metadata permanently. Audio was never stored, so no recording remains.
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        title="Place an outbound call"
        description="This requests a call from the telephony provider. It is never automatic."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCallOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="outbound-call-form" loading={callBusy}>
              Place call
            </Button>
          </>
        }
      >
        <form id="outbound-call-form" onSubmit={submitOutboundCall} className="space-y-4">
          {callResult && <Alert tone="success">{callResult}</Alert>}
          {callError && (
            <Alert tone="error" title={callError.message}>
              {callError.hint}
            </Alert>
          )}
          <Field label="Agent" htmlFor="outbound-agent" required hint="Only active agents can place calls.">
            <select
              id="outbound-agent"
              className="input"
              value={callForm.agentId}
              required
              onChange={(event) => setCallForm((previous) => ({ ...previous, agentId: event.target.value }))}
            >
              <option value="" disabled>
                Select an agent
              </option>
              {activeAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Destination number"
            htmlFor="outbound-number"
            required
            hint="E.164 format, for example +260971234567. The destination country must be enabled on the provider account."
          >
            <Input
              id="outbound-number"
              value={callForm.toNumber}
              onChange={(event) => setCallForm((previous) => ({ ...previous, toNumber: event.target.value }))}
              placeholder="+260971234567"
              inputMode="tel"
              pattern="\+[1-9][0-9]{6,14}"
              required
            />
          </Field>
          <label className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas/60 px-3 py-2.5 text-[12px] leading-relaxed text-ink-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-line"
              checked={callForm.consent}
              onChange={(event) => setCallForm((previous) => ({ ...previous, consent: event.target.checked }))}
            />
            <span>
              I confirm the recipient has consented to this call and that it complies with applicable calling and
              recording laws in their country. The server records this confirmation.
            </span>
          </label>
          <div className="rounded-lg bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            Calls consume plan minutes and are limited per hour. Because no real-time voice gateway is deployed, connected
            calls state that live voice is unavailable and hang up — they never simulate a conversation.
          </div>
        </form>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 text-[13px] text-ink-800">{value}</p>
    </div>
  );
}
