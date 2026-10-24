import Link from 'next/link';
import { Logo } from '@/components/layout/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative hidden flex-1 flex-col justify-between bg-ink-950 px-10 py-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(60% 50% at 20% 10%, rgba(99,102,241,0.35) 0%, rgba(7,11,20,0) 60%), radial-gradient(50% 40% at 90% 80%, rgba(67,56,202,0.35) 0%, rgba(7,11,20,0) 70%)',
          }}
          aria-hidden
        />
        <div className="relative">
          <Logo dark />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Build AI voice agents your customers can actually talk to.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Design agent behaviour, ground answers in your real business information, transcribe audio with Whisper and
            test conversations before a single call is placed.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/70">
            {[
              'Server-side speech-to-text with Groq Whisper',
              'Business-grounded answers with human handoff rules',
              'Usage metering and per-plan limits enforced on the server',
              'Telephone calling only after a provider is verified',
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/35">VOICEPILOT AI · Secure by design · Built for international teams</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-canvas px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Logo />
            <Link href="/" className="text-xs font-semibold text-muted hover:text-ink-800">
              Back to site
            </Link>
          </div>
          {children}
          <p className="mt-8 text-center text-[11px] leading-relaxed text-muted">
            By continuing you agree that this platform may process business information you provide. Do not enter payment
            card numbers or unnecessary personal data.
          </p>
        </div>
      </div>
    </div>
  );
}
