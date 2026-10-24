import Link from 'next/link';

export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="VOICEPILOT AI home">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-800 shadow-sm">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M4 11v2" />
          <path d="M8 8v8" />
          <path d="M12 5v14" />
          <path d="M16 8v8" />
          <path d="M20 11v2" />
        </svg>
      </span>
      {!compact && (
        <span className={dark ? 'text-[15px] font-semibold tracking-tight text-white' : 'text-[15px] font-semibold tracking-tight text-ink-950'}>
          VOICE<span className="text-brand-500">PILOT</span>
          <span className={dark ? 'ml-1 text-[10px] font-bold text-white/60' : 'ml-1 text-[10px] font-bold text-muted'}>AI</span>
        </span>
      )}
    </Link>
  );
}
