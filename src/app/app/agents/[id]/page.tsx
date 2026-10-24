'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Trash2, Wand2 } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useAgent } from '@/lib/client/firestore-data';
import { AgentForm } from '@/components/agents/agent-form';
import { Alert, Button, Modal, PageHeader, SkeletonLines } from '@/components/ui';
import { apiFetch, errorMessage } from '@/lib/client/api';

export default function EditAgentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: agent, loading, error } = useAgent(user?.uid, params?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!agent) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      router.push('/app/agents');
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <div>
      <Link href="/app/agents" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to agents
      </Link>

      {loading && !agent && (
        <div className="card card-body">
          <SkeletonLines count={6} />
        </div>
      )}

      {error && (
        <Alert tone="error" title="Could not load this agent">
          {error}
        </Alert>
      )}

      {agent && (
        <>
          <PageHeader
            eyebrow="Agent settings"
            title={agent.name}
            description="Edit identity, voice, knowledge and escalation. Changes are saved to your workspace only."
            actions={
              <>
                <Link href={`/app/voice-lab?agent=${agent.id}`}>
                  <Button variant="secondary">
                    <Wand2 className="h-4 w-4" aria-hidden />
                    Test agent
                  </Button>
                </Link>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete
                </Button>
              </>
            }
          />
          <AgentForm mode="edit" agent={agent} />
        </>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this agent?"
        description="This permanently removes the agent configuration. Call records keep their stored agent name."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Delete agent
            </Button>
          </>
        }
      >
        {deleteError ? <Alert tone="error">{deleteError}</Alert> : <p>This action cannot be undone.</p>}
      </Modal>
    </div>
  );
}
