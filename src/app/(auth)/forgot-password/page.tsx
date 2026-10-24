'use client';

import Link from 'next/link';
import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authErrorMessage } from '@/lib/client/auth-errors';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
      setSent(true);
    } catch (err) {
      const mapped = authErrorMessage(err);
      // Do not reveal whether an account exists for unknown addresses.
      if ((err as { code?: string })?.code === 'auth/user-not-found') {
        setSent(true);
      } else {
        setError(mapped);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-body">
      <h1 className="text-xl font-semibold tracking-tight text-ink-950">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted">Enter your account email and we will send a reset link.</p>

      {sent ? (
        <>
          <Alert tone="success" title="Check your inbox" className="mt-5">
            If an account exists for {email}, a password reset link is on its way. The link expires after one hour.
          </Alert>
          <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          {error && (
            <Alert tone="error" title={error.message} className="mt-5">
              {error.hint}
            </Alert>
          )}
          <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
            <Field label="Work email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </Field>
            <Button type="submit" className="w-full" loading={busy}>
              Send reset link
            </Button>
          </form>
          <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}
