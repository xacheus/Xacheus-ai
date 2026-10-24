'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authErrorMessage } from '@/lib/client/auth-errors';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy('password');
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
      router.replace(next.startsWith('/') ? next : '/app');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onGoogle() {
    setError(null);
    setBusy('google');
    try {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
      router.replace(next.startsWith('/') ? next : '/app');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card card-body">
      <h1 className="text-xl font-semibold tracking-tight text-ink-950">Sign in to VOICEPILOT AI</h1>
      <p className="mt-1.5 text-sm text-muted">Manage your AI agents, transcriptions and call data.</p>

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
        <Field
          label="Password"
          htmlFor="password"
          required
          hint={
            <Link href="/forgot-password" className="font-medium text-brand-600 hover:underline">
              Forgot your password?
            </Link>
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" className="w-full" loading={busy === 'password'} disabled={busy !== null}>
          Sign in
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button variant="secondary" className="w-full" onClick={onGoogle} loading={busy === 'google'} disabled={busy !== null}>
        Continue with Google
      </Button>

      <p className="mt-6 text-center text-sm text-muted">
        New to VOICEPILOT AI?{' '}
        <Link href="/signup" className="font-semibold text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="card card-body h-80" aria-hidden />}>
      <LoginForm />
    </Suspense>
  );
}
