import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
  CircleSlash,
  Database,
  Globe2,
  Headphones,
  Lock,
  Mic,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Waves,
} from 'lucide-react';
import { Logo } from '@/components/layout/brand';
import { PLANS, formatPrice } from '@/lib/plans';
import { providerStatus } from '@/lib/env';

const features = [
  {
    icon: Bot,
    title: 'Agent builder with guardrails',
    body: 'Define purpose, tone, language, FAQs and escalation rules. Agents only state information you supply.',
  },
  {
    icon: Mic,
    title: 'Groq Whisper transcription',
    body: 'Upload audio or record in the browser. Server-side transcription with format, size and usage validation.',
  },
  {
    icon: Database,
    title: 'Business-grounded answers',
    body: 'Your workspace knowledge, products and contact details feed every reply. Unknowns become a human handoff.',
  },
  {
    icon: ShieldCheck,
    title: 'Server-enforced limits',
    body: 'Plan limits, per-user quotas and rate limits are checked on the server, not in the browser.',
  },
  {
    icon: PhoneCall,
    title: 'Telephony-ready architecture',
    body: 'Twilio webhooks, call records and status tracking are implemented and disabled until configured and tested.',
  },
  {
    icon: Globe2,
    title: 'Multi-workspace isolation',
    body: 'Firestore rules and server checks keep every agent, workspace and call record scoped to its owner.',
  },
];

const steps = [
  { title: 'Describe your business', body: 'Add services, hours, contact details and approved answers in one workspace.' },
  { title: 'Shape the agent', body: 'Set personality, language, welcome message, transfer rules and knowledge.' },
  { title: 'Test and measure', body: 'Transcribe real recordings, hold text conversations and watch usage against your plan.' },
];

// Provider status is read from the server environment at request time.
export const dynamic = 'force-dynamic';

export default function LandingPage() {
  const providers = providerStatus();

  return (
    <div className="bg-canvas">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo dark />
          <nav className="hidden items-center gap-7 text-sm text-white/70 md:flex" aria-label="Primary">
            <a href="#features" className="hover:text-white">Platform</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#status" className="hover:text-white">Availability</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-ink-950 hover:bg-white/90"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 pb-20 pt-16 sm:pt-24">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(55% 45% at 15% 0%, rgba(99,102,241,0.32) 0%, rgba(7,11,20,0) 60%), radial-gradient(45% 40% at 85% 20%, rgba(67,56,202,0.28) 0%, rgba(7,11,20,0) 65%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI voice operations
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
              AI voice agents your customers can actually talk to.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/65">
              VOICEPILOT AI gives your business one place to design agent behaviour, transcribe real conversations with
              Whisper, ground every answer in your own information and measure usage — before you ever enable live calling.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-400"
              >
                Create a free workspace
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/5"
              >
                Sign in to your dashboard
              </Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6">
              {[
                ['Free tier', '1 agent included'],
                ['Speech-to-text', 'Whisper large v3 turbo'],
                ['Data isolation', 'Per-owner rules'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</dt>
                  <dd className="mt-1 text-[13px] font-medium text-white/80">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Product preview */}
          <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-2xl backdrop-blur">
            <div className="rounded-xl bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Voice lab</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink-950">Reception assistant</p>
                </div>
                <span className="badge border border-emerald-200 bg-emerald-50 text-emerald-700">Active</span>
              </div>

              <div className="mt-4 space-y-2.5">
                <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-canvas px-3 py-2 text-[12.5px] text-ink-700">
                  Hi, this is the Lakeside Dental assistant. How can I help today?
                </div>
                <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-brand-600 px-3 py-2 text-[12.5px] text-white">
                  Do you open on Saturday?
                </div>
                <div className="max-w-[90%] rounded-xl rounded-tl-sm bg-canvas px-3 py-2 text-[12.5px] text-ink-700">
                  We&apos;re open Saturday from 9am to 1pm. Would you like the address or a callback?
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Mic className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="flex flex-1 items-end gap-[3px]" aria-hidden>
                  {[6, 12, 9, 16, 11, 20, 14, 8, 17, 10, 6, 13].map((height, index) => (
                    <span key={index} className="w-[3px] rounded-full bg-brand-400" style={{ height }} />
                  ))}
                </div>
                <span className="text-[11px] font-medium text-muted">0:07</span>
              </div>

              <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-muted">
                <Lock className="h-3 w-3" aria-hidden />
                Browser test conversation — labelled separately from telephone calls.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">Platform</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">
            Everything you need before the first real call
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Each capability below ships in this release, or is clearly marked as inactive. Nothing pretends to be live
            before it is configured and tested.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="card card-body">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-ink-950">{feature.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{feature.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-line bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">How it works</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">
                From business knowledge to a tested agent
              </h2>
              <ol className="mt-8 space-y-6">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-canvas text-[13px] font-semibold text-brand-700">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-ink-950">{step.title}</h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-line bg-canvas p-6 sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Intended voice pipeline</p>
              <div className="mt-5 space-y-2.5 text-[13px]">
                {[
                  ['Caller audio', 'Browser microphone or telephone provider', true],
                  ['Speech recognition', 'Groq Whisper · server-side', true],
                  ['Language model', 'Groq chat completion · server-side', true],
                  ['Text-to-speech', 'Browser speech synthesis today', true],
                  ['Telephone transport', 'Twilio · disabled until verified', false],
                ].map(([title, detail, live]) => (
                  <div
                    key={String(title)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-3"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-ink-900">{title}</p>
                      <p className="text-[11.5px] text-muted">{detail}</p>
                    </div>
                    <span
                      className={
                        live
                          ? 'badge border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'badge border border-line bg-canvas text-muted'
                      }
                    >
                      {live ? 'Implemented' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-muted">
                Real-time interruption handling, media streaming and telephone transport require a deployed voice gateway
                plus a verified telephony account. They are not claimed as operational.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">Pricing</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">Plans that stay configurable</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Prices below are proposals. No payment provider is connected yet, so nothing is charged — plan changes are
            recorded on the server and can be overridden by an administrator.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={
                plan.highlighted
                  ? 'card card-body relative border-brand-300 ring-1 ring-brand-200'
                  : 'card card-body relative'
              }
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-5 rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-sm font-semibold text-ink-950">{plan.name}</h3>
              <p className="mt-1 min-h-[36px] text-[12.5px] leading-relaxed text-muted">{plan.tagline}</p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight text-ink-950">{formatPrice(plan)}</span>
                {plan.priceMonthlyUsd !== null && <span className="text-xs text-muted">/ month</span>}
              </p>
              <ul className="mt-4 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-700">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={
                  plan.highlighted
                    ? 'btn btn-primary mt-5 w-full'
                    : 'btn btn-secondary mt-5 w-full'
                }
              >
                {plan.id === 'starter' ? 'Start free' : plan.id === 'enterprise' ? 'Contact sales' : 'Choose plan'}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] text-muted">
          Limits shown are server-enforced defaults and can be changed with environment configuration. Paid plans cannot be
          purchased until a payment provider is integrated and tested.
        </p>
      </section>

      {/* Status */}
      <section id="status" className="border-y border-line bg-white py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">Deployment status</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-950">What is live on this instance</h2>
            </div>
            <Link href="/signup" className="text-sm font-semibold text-brand-600 hover:underline">
              Create a workspace →
            </Link>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Waves,
                title: 'Speech-to-text',
                detail: providers.groq.configured ? 'Groq Whisper configured' : 'Awaiting GROQ_API_KEY',
                live: providers.groq.configured,
              },
              {
                icon: Sparkles,
                title: 'AI conversations',
                detail: providers.groq.configured ? `Model: ${providers.groq.textModel}` : 'Awaiting GROQ_API_KEY',
                live: providers.groq.configured,
              },
              {
                icon: Headphones,
                title: 'Telephone calls',
                detail: providers.telephony.callingEnabled ? 'Provider enabled' : 'Not activated',
                live: providers.telephony.callingEnabled,
              },
              {
                icon: CircleSlash,
                title: 'Billing',
                detail: 'No payment provider connected',
                live: false,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-xl border border-line bg-canvas px-4 py-4">
                  <div className="flex items-center justify-between">
                    <Icon className="h-4 w-4 text-ink-600" aria-hidden />
                    <span
                      className={
                        item.live
                          ? 'h-2 w-2 rounded-full bg-emerald-500'
                          : 'h-2 w-2 rounded-full bg-white ring-1 ring-line'
                      }
                      aria-hidden
                    />
                  </div>
                  <p className="mt-3 text-[13px] font-semibold text-ink-950">{item.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="bg-ink-950 py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo dark />
            <p className="mt-3 max-w-sm text-[12px] leading-relaxed text-white/45">
              AI voice agents for business. Built on Firebase, Groq Whisper and server-verified access control.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-white/55">
            <Link href="/login" className="hover:text-white">Sign in</Link>
            <Link href="/signup" className="hover:text-white">Create account</Link>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#status" className="hover:text-white">Availability</a>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl px-5 text-[11px] text-white/30">
          © {new Date().getFullYear()} VOICEPILOT AI. Prices are proposals; calling and billing are not active on this deployment.
        </div>
      </footer>
    </div>
  );
}
