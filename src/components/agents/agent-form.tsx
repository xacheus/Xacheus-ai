'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import { FaqEditor, type FaqItem } from '@/components/agents/faq-editor';
import { ApiClientError, apiFetch, errorMessage } from '@/lib/client/api';
import type { AgentDoc } from '@/lib/client/firestore-data';

const LANGUAGES = [
  ['en-US', 'English (United States)'],
  ['en-GB', 'English (United Kingdom)'],
  ['en-AU', 'English (Australia)'],
  ['en-ZA', 'English (South Africa)'],
  ['fr-FR', 'French'],
  ['pt-BR', 'Portuguese (Brazil)'],
  ['es-ES', 'Spanish (Spain)'],
  ['es-MX', 'Spanish (Mexico)'],
  ['de-DE', 'German'],
  ['it-IT', 'Italian'],
  ['nl-NL', 'Dutch'],
  ['ar-SA', 'Arabic'],
  ['hi-IN', 'Hindi'],
  ['sw-KE', 'Swahili'],
  ['zu-ZA', 'Zulu'],
  ['zh-CN', 'Chinese (Simplified)'],
  ['ja-JP', 'Japanese'],
  ['ko-KR', 'Korean'],
  ['tr-TR', 'Turkish'],
  ['ru-RU', 'Russian'],
];

const VOICE_PROVIDERS = [
  ['browser', 'Browser voice (available now)'],
  ['elevenlabs', 'ElevenLabs (not configured)'],
  ['vapi', 'Vapi (not configured)'],
  ['retell', 'Retell AI (not configured)'],
];

export interface AgentFormValues {
  name: string;
  purpose: string;
  businessName: string;
  personality: string;
  speakingStyle: string;
  systemInstructions: string;
  language: string;
  voiceProvider: 'browser' | 'elevenlabs' | 'vapi' | 'retell';
  voiceId: string;
  speakingRate: number;
  welcomeMessage: string;
  faqs: FaqItem[];
  knowledge: string;
  callHandlingInstructions: string;
  transferInstructions: string;
  transferNumber: string;
  businessHours: string;
  status: 'active' | 'inactive';
}

export function emptyAgentValues(businessName = ''): AgentFormValues {
  return {
    name: '',
    purpose: '',
    businessName,
    personality: 'Warm, calm and professional.',
    speakingStyle: 'Concise. One question at a time. No jargon.',
    systemInstructions: '',
    language: 'en-US',
    voiceProvider: 'browser',
    voiceId: 'browser-default',
    speakingRate: 1,
    welcomeMessage: '',
    faqs: [],
    knowledge: '',
    callHandlingInstructions:
      'Greet the caller, identify what they need, answer only from approved information, then confirm next steps.',
    transferInstructions:
      'If the caller asks for a person, or asks something you do not have facts for, apologise and offer a callback from the team.',
    transferNumber: '',
    businessHours: '',
    status: 'active',
  };
}

function toValues(agent: AgentDoc): AgentFormValues {
  return {
    name: agent.name,
    purpose: agent.purpose,
    businessName: agent.businessName,
    personality: agent.personality,
    speakingStyle: agent.speakingStyle,
    systemInstructions: agent.systemInstructions,
    language: agent.language,
    voiceProvider: (agent.voiceProvider as AgentFormValues['voiceProvider']) || 'browser',
    voiceId: agent.voiceId,
    speakingRate: agent.speakingRate,
    welcomeMessage: agent.welcomeMessage,
    faqs: agent.faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
    knowledge: agent.knowledge,
    callHandlingInstructions: agent.callHandlingInstructions,
    transferInstructions: agent.transferInstructions,
    transferNumber: agent.transferNumber,
    businessHours: agent.businessHours,
    status: agent.status,
  };
}

export function AgentForm({
  mode,
  agent,
  workspaceName,
}: {
  mode: 'create' | 'edit';
  agent?: AgentDoc;
  workspaceName?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<AgentFormValues>(() =>
    mode === 'edit' && agent ? toValues(agent) : emptyAgentValues(workspaceName || ''),
  );
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (values.name.trim().length < 2) {
      setError({ message: 'Give the agent a name with at least 2 characters.' });
      return;
    }
    const invalidFaq = values.faqs.find((faq) => !faq.question.trim() || !faq.answer.trim());
    if (invalidFaq) {
      setError({ message: 'Every FAQ needs both a question and an approved answer.' });
      return;
    }

    setBusy(true);
    try {
      const payload = {
        ...values,
        faqs: values.faqs.map((faq) => ({ question: faq.question.trim(), answer: faq.answer.trim() })),
      };

      if (mode === 'create') {
        const result = await apiFetch<{ agent: { id: string } }>('/api/agents', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        router.push(`/app/agents/${result.agent.id}`);
        router.refresh();
        return;
      }

      await apiFetch(`/api/agents/${agent?.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setSaved(true);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError({ message: err.message, hint: err.hint });
      } else {
        setError({ message: errorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <Alert tone="error" title={error.message}>
          {error.hint}
        </Alert>
      )}
      {saved && <Alert tone="success" title="Agent saved">Changes apply to new test conversations immediately.</Alert>}

      <Card>
        <CardHeader title="Identity" description="Who the agent is and which business it represents." />
        <div className="card-body grid gap-4 sm:grid-cols-2">
          <Field label="Agent name" htmlFor="agent-name" required hint="Shown in your dashboard and call records.">
            <Input
              id="agent-name"
              value={values.name}
              maxLength={80}
              required
              placeholder="Front desk assistant"
              onChange={(event) => update('name', event.target.value)}
            />
          </Field>
          <Field label="Business name" htmlFor="agent-business" hint="Defaults to your workspace name.">
            <Input
              id="agent-business"
              value={values.businessName}
              maxLength={120}
              placeholder="Lakeside Dental"
              onChange={(event) => update('businessName', event.target.value)}
            />
          </Field>
          <Field label="Purpose" htmlFor="agent-purpose" hint="One line describing the agent's job." className="sm:col-span-2">
            <Input
              id="agent-purpose"
              value={values.purpose}
              maxLength={300}
              placeholder="Answer questions about opening hours, services and bookings."
              onChange={(event) => update('purpose', event.target.value)}
            />
          </Field>
          <Field label="Language" htmlFor="agent-language" hint="The agent replies only in this language.">
            <Select
              id="agent-language"
              value={values.language}
              onChange={(event) => update('language', event.target.value)}
            >
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label} ({code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Activation" htmlFor="agent-status" hint="Inactive agents cannot be tested or called.">
            <Select
              id="agent-status"
              value={values.status}
              onChange={(event) => update('status', event.target.value as AgentFormValues['status'])}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Voice and personality" description="How the agent sounds and speaks." />
        <div className="card-body grid gap-4 sm:grid-cols-2">
          <Field label="Personality" htmlFor="agent-personality" hint="Character traits the model should express.">
            <Input
              id="agent-personality"
              value={values.personality}
              maxLength={300}
              onChange={(event) => update('personality', event.target.value)}
            />
          </Field>
          <Field label="Speaking style" htmlFor="agent-style" hint="Sentence length, formality, pacing.">
            <Input
              id="agent-style"
              value={values.speakingStyle}
              maxLength={300}
              onChange={(event) => update('speakingStyle', event.target.value)}
            />
          </Field>
          <Field
            label="Voice provider"
            htmlFor="agent-voice-provider"
            hint="Only the browser voice is connected on this deployment. Other providers are stored for future use."
          >
            <Select
              id="agent-voice-provider"
              value={values.voiceProvider}
              onChange={(event) => update('voiceProvider', event.target.value as AgentFormValues['voiceProvider'])}
            >
              {VOICE_PROVIDERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Speaking rate — ${values.speakingRate.toFixed(2)}×`} htmlFor="agent-rate" hint="0.5× slow to 1.5× fast.">
            <input
              id="agent-rate"
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={values.speakingRate}
              onChange={(event) => update('speakingRate', Number(event.target.value))}
              className="mt-3"
            />
          </Field>
          <Field label="Welcome message" htmlFor="agent-welcome" className="sm:col-span-2" hint="The first thing a caller hears.">
            <Input
              id="agent-welcome"
              value={values.welcomeMessage}
              maxLength={600}
              placeholder="Thanks for calling Lakeside Dental. How can I help today?"
              onChange={(event) => update('welcomeMessage', event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Knowledge and approved answers"
          description="The only business facts the agent may state. Anything else triggers a human handoff."
        />
        <div className="card-body space-y-4">
          <Field
            label="Business knowledge"
            htmlFor="agent-knowledge"
            hint="Services, policies, pricing you are willing to quote, directions, parking — facts only."
          >
            <Textarea
              id="agent-knowledge"
              value={values.knowledge}
              maxLength={8000}
              className="min-h-[130px]"
              placeholder="We are at 14 Lake Road, open Monday to Friday 8am–5pm. We accept cash and card. Emergency appointments are same-day."
              onChange={(event) => update('knowledge', event.target.value)}
            />
          </Field>
          <Field label="Business hours" htmlFor="agent-hours" hint="Overrides the workspace hours for this agent.">
            <Input
              id="agent-hours"
              value={values.businessHours}
              maxLength={300}
              placeholder="Mon–Fri 08:00–17:00, Sat 09:00–13:00"
              onChange={(event) => update('businessHours', event.target.value)}
            />
          </Field>
          <FaqEditor value={values.faqs} onChange={(faqs) => update('faqs', faqs)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Call handling and escalation" description="How the agent manages a conversation and when to hand over." />
        <div className="card-body grid gap-4">
          <Field
            label="Call handling instructions"
            htmlFor="agent-handling"
            hint="Applies to both test conversations and future calls."
          >
            <Textarea
              id="agent-handling"
              value={values.callHandlingInstructions}
              maxLength={3000}
              onChange={(event) => update('callHandlingInstructions', event.target.value)}
            />
          </Field>
          <Field
            label="Human transfer instructions"
            htmlFor="agent-transfer"
            hint="Say explicitly that a person will follow up — the agent must not promise a live transfer unless calling is active."
          >
            <Textarea
              id="agent-transfer"
              value={values.transferInstructions}
              maxLength={1500}
              onChange={(event) => update('transferInstructions', event.target.value)}
            />
          </Field>
          <Field
            label="Transfer number"
            htmlFor="agent-transfer-number"
            hint="Optional. Stored for future telephony; not dialled from the browser."
          >
            <Input
              id="agent-transfer-number"
              value={values.transferNumber}
              maxLength={30}
              placeholder="+260971234567"
              onChange={(event) => update('transferNumber', event.target.value)}
            />
          </Field>
          <Field
            label="Additional system instructions (advanced)"
            htmlFor="agent-system"
            hint="Appended to the guarded system prompt. Do not include secrets or customer data."
          >
            <Textarea
              id="agent-system"
              value={values.systemInstructions}
              maxLength={6000}
              className="min-h-[100px]"
              placeholder="Always mention that same-day appointments are limited."
              onChange={(event) => update('systemInstructions', event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {mode === 'create'
              ? 'Your plan limit applies. The agent starts with the status you selected.'
              : 'Saved changes update the system prompt used for new conversations.'}
          </p>
          <div className="flex gap-2">
            {mode === 'edit' && (
              <Button type="button" variant="secondary" onClick={() => router.push('/app/agents')}>
                Back to agents
              </Button>
            )}
            <Button type="submit" loading={busy}>
              {mode === 'create' ? 'Create agent' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
