'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authErrorMessage } from '@/lib/client/auth-errors';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError({ message: 'Choose a password with at least 8 characters.' });
      return;
    }
    if (form.password !== form.confirm) {
      setError({ message: 'Passwords do not match.' });
      return;
    }

    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const credential = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      if (form.name.trim()) {
        await updateProfile(credential.user, { displayName: form.name.trim() });
      }
      // A verification email is sent, but registration must not fail if the
      // mail provider is slow — the app shows a resend option instead.
      await sendEmailVerification(credential.user).catch(() => undefined);
      router.replace('/app');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-body">
      <h1 className="text-xl font-semibold tracking-tight text-ink-950">Create your workspace</h1>
      <p className="mt-1.5 text-sm text-muted">
        Start free: one agent, 30 minutes of speech-to-text and 100 test conversations each month.
      </p>

      {error && (
        <Alert tone="error" title={error.message} className="mt-5">
          {error.hint}
        </Alert>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <Field label="Your name" htmlFor="name">
          <Input
            id="name"
            autoComplete="name"
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="Amara Banda"
          />
        </Field>
        <Field label="Work email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Password" htmlFor="password" required hint="At least 8 characters. Use a unique password.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" required>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={(event) => update('confirm', event.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
