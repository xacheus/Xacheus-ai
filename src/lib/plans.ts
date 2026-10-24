import type { Plan, PlanId } from './types';

/**
 * Subscription catalogue.
 *
 * Prices and limits are PROPOSALS and intentionally configurable:
 *  - individual env overrides (see `applyEnvOverrides`)
 *  - or the whole catalogue via `PLAN_CONFIG_JSON` (valid JSON array of partial
 *    plan objects keyed by `id`), e.g.:
 *    PLAN_CONFIG_JSON='[{"id":"business","priceMonthlyUsd":24}]'
 *
 * No payment provider is integrated. Nothing here charges a customer; the
 * `billingProvider` on a subscription stays `none` until a real provider is
 * connected and tested.
 */

const basePlans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Build and test your first AI agent.',
    priceMonthlyUsd: 0,
    limits: {
      agents: 1,
      transcriptionSecondsPerMonth: 1800,
      chatRequestsPerMonth: 100,
      callMinutesPerMonth: 0,
    },
    features: [
      '1 AI voice agent',
      '30 minutes of speech-to-text per month',
      '100 test conversations per month',
      'Browser voice testing',
      'Calling not included',
    ],
    cta: 'Current free tier',
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'For small teams handling real call volume.',
    priceMonthlyUsd: 19,
    limits: {
      agents: 5,
      transcriptionSecondsPerMonth: 18000,
      chatRequestsPerMonth: 1500,
      callMinutesPerMonth: 60,
    },
    features: [
      '5 AI voice agents',
      '5 hours of speech-to-text per month',
      '1,500 test conversations per month',
      'Call history and summaries',
      'Business workspace knowledge base',
      '60 telephone minutes when telephony is activated (low-cost destinations; see docs/PRICING.md)',
    ],
    highlighted: true,
    cta: 'Upgrade (payment not yet available)',
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'For operations teams running multi-agent flows.',
    priceMonthlyUsd: 79,
    limits: {
      agents: 25,
      transcriptionSecondsPerMonth: 72000,
      chatRequestsPerMonth: 10000,
      callMinutesPerMonth: 400,
    },
    features: [
      '25 AI voice agents',
      '20 hours of speech-to-text per month',
      '10,000 test conversations per month',
      '400 telephone minutes (destination rates apply)',
      'Human transfer rules and escalation',
      'Usage analytics and cost estimates',
      'Priority support',
    ],
    cta: 'Upgrade (payment not yet available)',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For regulated, high-volume deployments.',
    priceMonthlyUsd: null,
    limits: null,
    features: [
      'Custom agent and minute allowances',
      'Custom telephony and voice providers',
      'Data retention and residency options',
      'SSO and audit controls',
      'Named support and onboarding',
    ],
    cta: 'Contact sales',
  },
];

function applyOverrides(plans: Plan[]): Plan[] {
  let overrides: Partial<Plan>[] = [];

  const raw = process.env.PLAN_CONFIG_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) overrides = parsed;
    } catch {
      console.warn('[plans] PLAN_CONFIG_JSON is not valid JSON — ignoring overrides.');
    }
  }

  const starterSeconds = numOrNull(process.env.STARTER_TRANSCRIPTION_SECONDS);
  const starterChat = numOrNull(process.env.STARTER_CHAT_REQUESTS);
  const starterAgents = numOrNull(process.env.STARTER_AGENTS);

  return plans.map((plan) => {
    let next = { ...plan, limits: plan.limits ? { ...plan.limits } : null };

    if (plan.id === 'starter') {
      if (starterSeconds !== null && next.limits) next.limits.transcriptionSecondsPerMonth = starterSeconds;
      if (starterChat !== null && next.limits) next.limits.chatRequestsPerMonth = starterChat;
      if (starterAgents !== null && next.limits) next.limits.agents = starterAgents;
    }

    const override = overrides.find((o) => o.id === plan.id);
    if (override) {
      next = {
        ...next,
        ...override,
        limits: override.limits ? { ...next.limits, ...override.limits } : next.limits,
      };
    }
    return next;
  });
}

function numOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export const PLANS: Plan[] = applyOverrides(basePlans);

export const DEFAULT_PLAN_ID: PlanId = 'starter';

export function getPlan(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function planLimits(id: string | null | undefined): Plan['limits'] {
  return getPlan(id).limits;
}

/** Format a limit for display. `null` means "custom / not enforced". */
export function describeLimit(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return 'Custom';
  return `${value.toLocaleString('en-US')} ${unit}`;
}

export function formatPrice(plan: Plan): string {
  if (plan.priceMonthlyUsd === null) return 'Custom';
  if (plan.priceMonthlyUsd === 0) return '$0';
  return `$${plan.priceMonthlyUsd}`;
}
