import { z } from 'zod';
import { apiErrors } from './errors';

/** Parse a JSON body against a schema, returning a clean 400 on failure. */
export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw apiErrors.badRequest('Request body must be valid JSON.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw apiErrors.badRequest(
      'Some fields are invalid.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }
  return result.data;
}

const faqSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(2000),
});

export const agentInputSchema = z.object({
  name: z.string().trim().min(2, 'Agent name must be at least 2 characters.').max(80),
  purpose: z.string().trim().max(300).default(''),
  businessName: z.string().trim().max(120).default(''),
  personality: z.string().trim().max(300).default(''),
  speakingStyle: z.string().trim().max(300).default(''),
  systemInstructions: z.string().trim().max(6000).default(''),
  language: z.string().trim().min(2).max(40).default('en-US'),
  voiceProvider: z.enum(['browser', 'elevenlabs', 'vapi', 'retell']).default('browser'),
  voiceId: z.string().trim().max(80).default('browser-default'),
  speakingRate: z.number().min(0.5).max(1.5).default(1),
  welcomeMessage: z.string().trim().max(600).default(''),
  faqs: z.array(faqSchema).max(25).default([]),
  knowledge: z.string().trim().max(8000).default(''),
  callHandlingInstructions: z.string().trim().max(3000).default(''),
  transferInstructions: z.string().trim().max(1500).default(''),
  transferNumber: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === '' || /^\+?[0-9 ()-]{6,25}$/.test(v), 'Use an international format such as +260971234567.')
    .default(''),
  businessHours: z.string().trim().max(300).default(''),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const agentPatchSchema = agentInputSchema.partial();

export const workspaceInputSchema = z.object({
  name: z.string().trim().min(2, 'Business name is required.').max(120),
  description: z.string().trim().max(2000).default(''),
  contactEmail: z.string().trim().email('Enter a valid email address.').or(z.literal('')).default(''),
  contactPhone: z.string().trim().max(30).default(''),
  website: z.string().trim().max(200).default(''),
  timezone: z.string().trim().max(60).default('UTC'),
  businessHours: z.string().trim().max(400).default(''),
  faqs: z.array(faqSchema).max(40).default([]),
  products: z.string().trim().max(4000).default(''),
  appointmentInstructions: z.string().trim().max(2000).default(''),
  escalationContact: z.string().trim().max(300).default(''),
});

export const chatRequestSchema = z.object({
  agentId: z.string().trim().min(1, 'Select an agent.').max(120),
  message: z
    .string()
    .trim()
    .min(1, 'Enter a message.')
    .max(2000, 'Keep test messages under 2000 characters.'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(20)
    .default([]),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().max(80).default(''),
  phone: z.string().trim().max(30).default(''),
  country: z.string().trim().max(60).default(''),
  /** Requested metadata retention window. 0 means "keep until deleted". */
  retentionDays: z.number().int().min(0).max(365).optional(),
});

export const outboundCallSchema = z.object({
  agentId: z.string().trim().min(1).max(120),
  toNumber: z
    .string()
    .trim()
    .min(6)
    .max(25)
    .regex(/^\+[1-9][0-9]{6,14}$/, 'Use E.164 format, for example +260971234567.'),
  consentConfirmed: z.literal(true, { message: 'Confirm you have consent to call this number.' }),
});

export const retentionSchema = z.object({
  retentionDays: z.number().int().min(1).max(365),
});

export const adminPlanOverrideSchema = z.object({
  planId: z.enum(['starter', 'business', 'professional', 'enterprise']),
  note: z.string().trim().max(300).default(''),
});

export type AgentInput = z.infer<typeof agentInputSchema>;
export type WorkspaceInput = z.infer<typeof workspaceInputSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
