'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useWorkspace } from '@/lib/client/firestore-data';
import { AgentForm } from '@/components/agents/agent-form';
import { Alert, PageHeader } from '@/components/ui';

export default function NewAgentPage() {
  const { user, account } = useAuth();
  const { data: workspace } = useWorkspace(user?.uid);

  return (
    <div>
      <Link href="/app/agents" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to agents
      </Link>

      <PageHeader
        eyebrow="New agent"
        title="Design an AI voice agent"
        description="Everything here becomes part of the guarded system prompt. The agent will not invent policies, prices or availability."
      />

      {account && !account.serverMetering && (
        <Alert tone="error" title="Server credentials are required to create agents" className="mb-4">
          Add <code className="rounded bg-red-100 px-1">FIREBASE_SERVICE_ACCOUNT_KEY</code> to the server environment.
          Without it, agent creation is blocked by design so that plan limits cannot be bypassed.
        </Alert>
      )}

      <AgentForm mode="create" workspaceName={workspace?.name || ''} />
    </div>
  );
}
