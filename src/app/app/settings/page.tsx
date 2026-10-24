'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BadgeCheck, Database, KeyRound, LogOut, Save, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';

const RETENTION_OPTIONS = [
  { value: 0, label: 'Keep call metadata until I delete it' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '365 days' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, account, signOut, resendVerification, refreshAccount, accountLoading } = useAuth();

  const [profile, setProfile] = useState({ displayName: '', phone: '', country: '' });
  const [retentionDays, setRetentionDays] = useState(0);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingRetention, setSavingRetention] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [retentionSaved, setRetentionSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationState, setVerificationState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      displayName: user.displayName || '',
      phone: account?.phone || '',
      country: account?.country || '',
    });
    setRetentionDays(account?.retentionDays ?? 0);
  }, [user, account]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    setError(null);
    setProfileSaved(false);
    try {
      await apiFetch('/api/me', { method: 'PATCH', body: JSON.stringify(profile) });
      setProfileSaved(true);
      await refreshAccount();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveRetention() {
    setSavingRetention(true);
    setError(null);
    setRetentionSaved(false);
    try {
      await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ ...profile, retentionDays }),
      });
      setRetentionSaved(true);
      await refreshAccount();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingRetention(false);
    }
  }

  async function resend() {
    setVerificationState('sending');
    try {
      await resendVerification();
      setVerificationState('sent');
    } catch {
      setVerificationState('idle');
      setError('Could not send a verification email. Try again in a few minutes.');
    }
  }

  async function sendReset() {
    if (!user?.email) return;
    setResetState('sending');
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), user.email);
      setResetState('sent');
    } catch (err) {
      setResetState('idle');
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Profile details, security and data retention for your workspace."
      />

      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Profile"
              description="Shown in your dashboard. Not used to determine permissions."
              action={<UserRound className="h-4 w-4 text-muted" aria-hidden />}
            />
            <form onSubmit={saveProfile} className="card-body space-y-4">
              {profileSaved && <Alert tone="success">Profile updated.</Alert>}
              <Field label="Display name" htmlFor="display-name">
                <Input
                  id="display-name"
                  value={profile.displayName}
                  maxLength={80}
                  placeholder="Amara Banda"
                  onChange={(event) => setProfile((previous) => ({ ...previous, displayName: event.target.value }))}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact phone" htmlFor="profile-phone" hint="Optional. Used for account support only.">
                  <Input
                    id="profile-phone"
                    value={profile.phone}
                    maxLength={30}
                    placeholder="+260971234567"
                    onChange={(event) => setProfile((previous) => ({ ...previous, phone: event.target.value }))}
                  />
                </Field>
                <Field label="Country" htmlFor="profile-country" hint="Helps us assess telephony eligibility.">
                  <Input
                    id="profile-country"
                    value={profile.country}
                    maxLength={60}
                    placeholder="Zambia"
                    onChange={(event) => setProfile((previous) => ({ ...previous, country: event.target.value }))}
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={savingProfile}>
                  <Save className="h-4 w-4" aria-hidden />
                  Save profile
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Security"
              description="Sign-in method, email verification and credentials."
              action={<ShieldCheck className="h-4 w-4 text-muted" aria-hidden />}
            />
            <div className="card-body space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-ink-900">Email address</p>
                  <p className="text-[12px] text-muted">{user?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {user?.emailVerified ? (
                    <Badge tone="success">
                      <BadgeCheck className="h-3 w-3" aria-hidden />
                      Verified
                    </Badge>
                  ) : (
                    <Badge tone="warning">Not verified</Badge>
                  )}
                  {!user?.emailVerified && (
                    <Button
                      variant="secondary"
                      small
                      onClick={resend}
                      loading={verificationState === 'sending'}
                      disabled={verificationState === 'sent'}
                    >
                      {verificationState === 'sent' ? 'Email sent' : 'Resend'}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-900">
                    <KeyRound className="h-3.5 w-3.5 text-muted" aria-hidden />
                    Password
                  </p>
                  <p className="text-[12px] text-muted">Send a reset link to your email address.</p>
                </div>
                <Button variant="secondary" small onClick={sendReset} loading={resetState === 'sending'} disabled={resetState === 'sent'}>
                  {resetState === 'sent' ? 'Link sent' : 'Reset password'}
                </Button>
              </div>

              <p className="text-[11.5px] leading-relaxed text-muted">
                Administrator access is granted only through a server-verified Firebase custom claim. It cannot be enabled from
                this page or from any browser request.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Data and retention"
              description="What is stored, and for how long."
              action={<Database className="h-4 w-4 text-muted" aria-hidden />}
            />
            <div className="card-body space-y-4">
              {retentionSaved && <Alert tone="success">Retention preference saved.</Alert>}
              <div className="space-y-2.5 text-[12.5px] leading-relaxed text-ink-700">
                <p>
                  <strong className="font-semibold">Audio:</strong> not stored. Recordings and uploads are held in memory,
                  sent to the transcription provider, and discarded after the response.
                </p>
                <p>
                  <strong className="font-semibold">Transcripts:</strong> test transcripts stay in your browser unless you
                  copy them. No transcript is written to the database by the voice lab.
                </p>
                <p>
                  <strong className="font-semibold">Call metadata:</strong> stored when a call actually occurs, readable only
                  by you and platform administrators for support.
                </p>
              </div>

              <Field
                label="Preferred call-record retention"
                htmlFor="retention"
                hint="Automatic purging requires a scheduled cleanup job, which is not deployed yet. Until then, records are kept until you delete them."
              >
                <Select
                  id="retention"
                  value={retentionDays}
                  onChange={(event) => setRetentionDays(Number(event.target.value))}
                >
                  {RETENTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="flex flex-wrap justify-between gap-2">
                <Link href="/app/calls">
                  <Button variant="secondary" small>
                    Review call records
                  </Button>
                </Link>
                <Button variant="secondary" small onClick={saveRetention} loading={savingRetention}>
                  Save retention
                </Button>
              </div>

              <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-red-800">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Deleting data
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-red-900/80">
                  Individual call records can be deleted from call history. Deleting your account and all associated data is
                  handled by support so that billing and audit records are handled correctly. Contact the platform
                  administrator to request erasure.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Account" />
            <div className="card-body space-y-3 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <span className="text-muted">Plan</span>
                <span className="font-medium text-ink-900">{account?.planName || 'Starter'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Usage period</span>
                <span className="font-medium text-ink-900">{account?.usage?.month || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Server metering</span>
                <span className="font-medium text-ink-900">
                  {accountLoading ? '…' : account?.serverMetering ? 'Active' : 'Unavailable'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">User ID</span>
                <span className="max-w-[160px] truncate font-mono text-[11px] text-ink-700">{user?.uid}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Administrator</span>
                <span className="font-medium text-ink-900">{account?.isAdmin ? 'Yes' : 'No'}</span>
              </div>
              <Link href="/app/usage" className="mt-2 block text-[12px] font-semibold text-brand-600 hover:underline">
                View usage and limits →
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader title="Session" />
            <div className="card-body">
              <Button variant="secondary" className="w-full" onClick={() => setConfirmSignOut(true)}>
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </Button>
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                Signing out clears your session on this browser. Firebase keeps your account and data intact.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Privacy reminders" />
            <div className="card-body space-y-2 text-[11.5px] leading-relaxed text-muted">
              <p>Do not enter payment card data, passwords, government identifiers or health records anywhere in this app.</p>
              <p>
                AI replies are generated by a third-party provider. Avoid sending confidential information in test
                conversations.
              </p>
              <p>Telephone calling is disabled unless a provider has been configured and verified by an administrator.</p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title="Sign out of VOICEPILOT AI?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSignOut(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void signOut().then(() => router.push('/login'));
              }}
            >
              Sign out
            </Button>
          </>
        }
      >
        <p>You will need to sign in again to manage agents or run transcriptions.</p>
      </Modal>
    </div>
  );
}
