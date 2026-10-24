'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Bot,
  Building2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  PhoneCall,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { Logo } from '@/components/layout/brand';
import { Badge, Button, Spinner, cn } from '@/components/ui';

const navigation = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/app/agents', label: 'AI agents', icon: Bot },
  { href: '/app/voice-lab', label: 'Voice lab', icon: Mic },
  { href: '/app/calls', label: 'Call history', icon: PhoneCall },
  { href: '/app/workspace', label: 'Business workspace', icon: Building2 },
  { href: '/app/usage', label: 'Usage & plan', icon: CreditCard },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, account, accountError, signOut, resendVerification } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    if (!loading && !user) {
      const next = encodeURIComponent(pathname || '/app');
      router.replace(`/login?next=${next}`);
    }
  }, [loading, user, pathname, router]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Spinner /> Loading your workspace…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6 text-center">
        <div>
          <p className="text-sm font-medium text-ink-800">Redirecting to sign in…</p>
          <Link href="/login" className="mt-3 inline-block text-sm font-semibold text-brand-600">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  const items = account?.isAdmin
    ? [...navigation, { href: '/app/admin', label: 'Administration', icon: ShieldCheck }]
    : navigation;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  async function handleResend() {
    setResendState('sending');
    try {
      await resendVerification();
      setResendState('sent');
    } catch {
      setResendState('idle');
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo dark />
        <button
          type="button"
          className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {items.map((item) => {
          const active = isActive(item.href, 'exact' in item ? Boolean(item.exact) : false);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                active
                  ? 'bg-white/10 text-white shadow-inner'
                  : 'text-white/65 hover:bg-white/5 hover:text-white',
              )}
            >
              <Icon className={cn('h-[17px] w-[17px]', active ? 'text-brand-300' : 'text-white/45')} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="rounded-xl bg-white/5 px-3 py-3">
          <p className="truncate text-[13px] font-medium text-white">{account?.displayName || user.displayName || 'Your workspace'}</p>
          <p className="truncate text-[11px] text-white/50">{user.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-200">
              {account?.planName || 'Starter'} plan
            </span>
            {account?.planId === 'starter' && (
              <Link href="/app/usage" className="text-[10px] font-semibold text-white/60 underline-offset-2 hover:underline">
                Limits
              </Link>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut().then(() => router.push('/login'))}
          className="mt-2 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] bg-ink-900 md:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="relative h-full w-[280px] max-w-[85vw] bg-ink-900 shadow-lift">{sidebar}</aside>
        </div>
      )}

      <div className="md:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6 md:h-16">
          <button
            type="button"
            className="rounded-lg p-2 text-ink-700 hover:bg-canvas md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="md:hidden">
            <Logo compact />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/app/voice-lab" className="hidden sm:block">
              <Button variant="secondary" small>
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Test an agent
              </Button>
            </Link>
            {account?.emailVerified === false && (
              <Badge tone="warning" className="hidden sm:inline-flex">Email not verified</Badge>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
          {account?.emailVerified === false && (
            <div className="mb-5 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <p>
                <span className="font-semibold">Verify your email to unlock calling.</span>{' '}
                We sent a link to {user.email}. AI agent testing works without verification.
              </p>
              <Button
                variant="secondary"
                small
                onClick={handleResend}
                loading={resendState === 'sending'}
                disabled={resendState === 'sent'}
              >
                {resendState === 'sent' ? 'Email sent' : 'Resend email'}
              </Button>
            </div>
          )}

          {account && !account.serverMetering && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Server credentials are missing on this deployment.</p>
              <p className="mt-1 leading-relaxed">
                Set <code className="rounded bg-amber-100 px-1 py-0.5 text-[12px]">FIREBASE_SERVICE_ACCOUNT_KEY</code> and{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-[12px]">GROQ_API_KEY</code> in the server environment.
                Agent creation, usage metering and transcription stay disabled until both are present.
              </p>
            </div>
          )}

          {accountError && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">{accountError.message}</p>
              {accountError.hint && <p className="mt-1 leading-relaxed">{accountError.hint}</p>}
            </div>
          )}

          {children}
        </main>

        <footer className="mx-auto w-full max-w-[1180px] px-4 pb-8 text-xs text-muted sm:px-6">
          <p>
            VOICEPILOT AI · Test conversations are labelled separately from telephone calls. Telephone calling is
            {' '}
            <strong className="font-semibold text-ink-700">not activated</strong> unless a provider is configured and verified.
          </p>
        </footer>
      </div>
    </div>
  );
}
