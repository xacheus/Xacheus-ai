/** Shared domain types for VOICEPILOT AI. */

export type AgentStatus = 'active' | 'inactive';

export type VoiceProvider = 'browser' | 'elevenlabs' | 'vapi' | 'retell';

export interface Faq {
  question: string;
  answer: string;
}

export interface Agent {
  id: string;
  ownerId: string;
  workspaceId: string;
  name: string;
  purpose: string;
  businessName: string;
  personality: string;
  speakingStyle: string;
  systemInstructions: string;
  language: string;
  voiceProvider: VoiceProvider;
  voiceId: string;
  speakingRate: number;
  welcomeMessage: string;
  faqs: Faq[];
  knowledge: string;
  callHandlingInstructions: string;
  transferInstructions: string;
  transferNumber: string;
  businessHours: string;
  status: AgentStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  timezone: string;
  businessHours: string;
  faqs: Faq[];
  products: string;
  appointmentInstructions: string;
  escalationContact: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  workspaceId: string;
  phone?: string;
  country?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type CallDirection = 'inbound' | 'outbound';

export type CallStatus =
  | 'queued'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no-answer'
  | 'canceled';

export interface CallRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  agentId: string | null;
  agentName: string | null;
  direction: CallDirection;
  from: string;
  to: string;
  status: CallStatus;
  startTime?: unknown;
  endTime?: unknown;
  durationSeconds: number;
  transcript: string | null;
  summary: string | null;
  outcome: string | null;
  failureReason: string | null;
  provider: 'twilio';
  providerCallId: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TestSession {
  id: string;
  ownerId: string;
  agentId: string;
  agentName: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    at: unknown;
    source?: 'typed' | 'transcription';
  }>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UsageCounter {
  month: string; // YYYY-MM
  transcriptionSeconds: number;
  transcriptionCount: number;
  chatRequests: number;
  chatTokens: number;
  callMinutes: number;
  callCount: number;
  estimatedCostUsd: number;
}

export type PlanId = 'starter' | 'business' | 'professional' | 'enterprise';

export interface PlanLimits {
  agents: number | null;
  transcriptionSecondsPerMonth: number | null;
  chatRequestsPerMonth: number | null;
  callMinutesPerMonth: number | null;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthlyUsd: number | null; // null === custom pricing
  limits: PlanLimits | null; // null === custom limits
  features: string[];
  highlighted?: boolean;
  cta: string;
}

export interface Subscription {
  ownerId: string;
  planId: PlanId;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  billingProvider: 'none' | 'stripe' | 'other';
  currentPeriodStart?: unknown;
  currentPeriodEnd?: unknown;
  updatedAt?: unknown;
}
