'use client';

import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Info, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useWorkspace } from '@/lib/client/firestore-data';
import { FaqEditor, type FaqItem } from '@/components/agents/faq-editor';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  SkeletonLines,
  Textarea,
} from '@/components/ui';
import { apiFetch, errorMessage } from '@/lib/client/api';

interface WorkspaceValues {
  name: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  timezone: string;
  businessHours: string;
  faqs: FaqItem[];
  products: string;
  appointmentInstructions: string;
  escalationContact: string;
}

const EMPTY: WorkspaceValues = {
  name: '',
  description: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  timezone: 'UTC',
  businessHours: '',
  faqs: [],
  products: '',
  appointmentInstructions: '',
  escalationContact: '',
};

const TIMEZONES = [
  'UTC',
  'Africa/Lusaka',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Africa/Lagos',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
];

export default function WorkspacePage() {
  const { user } = useAuth();
  const { data: workspace, loading, error } = useWorkspace(user?.uid);
  const [values, setValues] = useState<WorkspaceValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; hint?: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    setValues({
      name: workspace.name,
      description: workspace.description,
      contactEmail: workspace.contactEmail,
      contactPhone: workspace.contactPhone,
      website: workspace.website,
      timezone: workspace.timezone,
      businessHours: workspace.businessHours,
      faqs: workspace.faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
      products: workspace.products,
      appointmentInstructions: workspace.appointmentInstructions,
      escalationContact: workspace.escalationContact,
    });
    setDirty(false);
  }, [workspace]);

  function update<K extends keyof WorkspaceValues>(key: K, value: WorkspaceValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaveError(null);

    if (values.name.trim().length < 2) {
      setSaveError({ message: 'Enter the business name before saving.' });
      return;
    }
    if (values.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) {
      setSaveError({ message: 'Enter a valid contact email address, or leave it blank.' });
      return;
    }
    const invalidFaq = values.faqs.find((faq) => !faq.question.trim() || !faq.answer.trim());
    if (invalidFaq) {
      setSaveError({ message: 'Every FAQ needs both a question and an approved answer.' });
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/api/workspace', {
        method: 'PUT',
        body: JSON.stringify({
          ...values,
          faqs: values.faqs.map((faq) => ({ question: faq.question.trim(), answer: faq.answer.trim() })),
        }),
      });
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setSaveError({ message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Business workspace"
        title="Business information"
        description="This is the single source of truth for every agent. If a fact is not stored here, agents must say they do not know and offer a human handoff."
        actions={
          <Button type="submit" form="workspace-form" loading={saving} disabled={!dirty && Boolean(workspace?.name)}>
            <Save className="h-4 w-4" aria-hidden />
            Save changes
          </Button>
        }
      />

      {error && (
        <Alert tone="error" title="Could not load your workspace" className="mb-4">
          {error}
        </Alert>
      )}

      {saveError && (
        <Alert tone="error" title={saveError.message} className="mb-4">
          {saveError.hint}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" title="Workspace saved" className="mb-4">
          New conversations will use these facts immediately.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <form id="workspace-form" onSubmit={onSubmit} className="space-y-4">
          <Card>
            <CardHeader title="Business profile" description="How the business is identified and reached." />
            <div className="card-body grid gap-4 sm:grid-cols-2">
              {loading && !workspace ? (
                <div className="sm:col-span-2">
                  <SkeletonLines count={6} />
                </div>
              ) : (
                <>
                  <Field label="Business name" htmlFor="ws-name" required className="sm:col-span-2">
                    <Input
                      id="ws-name"
                      value={values.name}
                      maxLength={120}
                      required
                      placeholder="Lakeside Dental"
                      onChange={(event) => update('name', event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Description"
                    htmlFor="ws-description"
                    className="sm:col-span-2"
                    hint="What you do, who you serve, and anything a caller needs to know first."
                  >
                    <Textarea
                      id="ws-description"
                      value={values.description}
                      maxLength={2000}
                      placeholder="A family dental practice in Lusaka offering general dentistry, cleanings and emergency appointments."
                      onChange={(event) => update('description', event.target.value)}
                    />
                  </Field>
                  <Field label="Contact email" htmlFor="ws-email">
                    <Input
                      id="ws-email"
                      type="email"
                      value={values.contactEmail}
                      maxLength={160}
                      placeholder="hello@lakesidedental.example"
                      onChange={(event) => update('contactEmail', event.target.value)}
                    />
                  </Field>
                  <Field label="Contact phone" htmlFor="ws-phone" hint="Use international format.">
                    <Input
                      id="ws-phone"
                      value={values.contactPhone}
                      maxLength={30}
                      placeholder="+260971234567"
                      onChange={(event) => update('contactPhone', event.target.value)}
                    />
                  </Field>
                  <Field label="Website" htmlFor="ws-website">
                    <Input
                      id="ws-website"
                      value={values.website}
                      maxLength={200}
                      placeholder="https://example.com"
                      onChange={(event) => update('website', event.target.value)}
                    />
                  </Field>
                  <Field label="Timezone" htmlFor="ws-timezone">
                    <Select
                      id="ws-timezone"
                      value={values.timezone}
                      onChange={(event) => update('timezone', event.target.value)}
                    >
                      {[...new Set([values.timezone, ...TIMEZONES])].filter(Boolean).map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Business hours"
                    htmlFor="ws-hours"
                    className="sm:col-span-2"
                    hint="Written exactly as the agent should state them."
                  >
                    <Input
                      id="ws-hours"
                      value={values.businessHours}
                      maxLength={400}
                      placeholder="Mon–Fri 08:00–17:00, Sat 09:00–13:00, closed Sunday"
                      onChange={(event) => update('businessHours', event.target.value)}
                    />
                  </Field>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Products, services and instructions" description="Facts the agent may quote, plus escalation details." />
            <div className="card-body space-y-4">
              <Field
                label="Products and services"
                htmlFor="ws-products"
                hint="Include exact prices only if you are willing to have them quoted to callers."
              >
                <Textarea
                  id="ws-products"
                  value={values.products}
                  maxLength={4000}
                  className="min-h-[110px]"
                  placeholder="Consultation $30 · Cleaning $45 · Emergency appointment $60. We accept cash and card."
                  onChange={(event) => update('products', event.target.value)}
                />
              </Field>
              <Field
                label="Appointment instructions"
                htmlFor="ws-appointments"
                hint="What the agent should say about booking. Do not promise availability that is not confirmed."
              >
                <Textarea
                  id="ws-appointments"
                  value={values.appointmentInstructions}
                  maxLength={2000}
                  className="min-h-[90px]"
                  placeholder="We cannot confirm appointments by phone. Take the caller's name and number and the team will call back within one business day."
                  onChange={(event) => update('appointmentInstructions', event.target.value)}
                />
              </Field>
              <Field
                label="Escalation contact"
                htmlFor="ws-escalation"
                hint="Who receives handoffs. Shown to agents as context, never dialled automatically."
              >
                <Input
                  id="ws-escalation"
                  value={values.escalationContact}
                  maxLength={300}
                  placeholder="Practice manager, +260971234567, available 09:00–16:00"
                  onChange={(event) => update('escalationContact', event.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Approved answers" description="Questions your agents may answer directly." />
            <div className="card-body">
              <FaqEditor
                value={values.faqs}
                onChange={(faqs) => update('faqs', faqs)}
                max={40}
                label="Company-wide FAQs"
                hint="Each agent can also have its own FAQ list. Answers here are shared across all agents."
              />
            </div>
          </Card>

          <div className="flex justify-end gap-2 pb-2">
            <Button type="submit" loading={saving} disabled={!dirty && Boolean(workspace?.name)}>
              <Save className="h-4 w-4" aria-hidden />
              Save changes
            </Button>
          </div>
        </form>

        <div className="space-y-4">
          <Card>
            <CardHeader title="How agents use this" />
            <div className="card-body space-y-3 text-[12.5px] leading-relaxed text-muted">
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                Facts here are injected into every agent&apos;s system prompt, together with the agent&apos;s own knowledge.
              </p>
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                Agents are instructed to refuse to invent prices, policies, availability or claims. Unknown questions become a
                human handoff.
              </p>
              <p className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
                Keep this factual. Marketing language can be interpreted as a promise to a caller.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="What not to store" />
            <div className="card-body space-y-2 text-[12.5px] leading-relaxed text-muted">
              <p>Do not enter payment card numbers, bank details, passwords, national IDs or medical records.</p>
              <p>
                Contact information you add here is used to answer callers. It is visible to you and to platform
                administrators for support purposes only.
              </p>
            </div>
          </Card>

          <Card className="border-brand-200 bg-brand-50/40">
            <div className="flex gap-3 p-4">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              <p className="text-[12px] leading-relaxed text-brand-900">
                Your workspace is scoped to your account. Other customers cannot read or query it — this is enforced in
                both Firestore security rules and server-side ownership checks.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
