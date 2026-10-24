import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildChatMessages, buildSystemPrompt, sanitiseSpokenReply, GUARDRAILS } from '../src/lib/ai/prompt';
import type { Agent, Workspace } from '../src/lib/types';

const agent: Agent = {
  id: 'a1',
  ownerId: 'u1',
  workspaceId: 'u1',
  name: 'Front desk',
  purpose: 'Answer questions about the dental practice',
  businessName: 'Lakeside Dental',
  personality: 'Warm and calm',
  speakingStyle: 'Short sentences',
  systemInstructions: '',
  language: 'en-GB',
  voiceProvider: 'browser',
  voiceId: 'browser-default',
  speakingRate: 1,
  welcomeMessage: 'Thanks for calling Lakeside Dental.',
  faqs: [{ question: 'Do you open on Saturday?', answer: 'Yes, 9am to 1pm.' }],
  knowledge: 'We are at 14 Lake Road.',
  callHandlingInstructions: 'Greet, understand, help.',
  transferInstructions: 'Offer a callback.',
  transferNumber: '+260971234567',
  businessHours: 'Mon-Fri 08:00-17:00',
  status: 'active',
};

const workspace: Workspace = {
  id: 'u1',
  ownerId: 'u1',
  name: 'Lakeside Dental',
  description: 'Family dentistry',
  contactEmail: 'hello@example.com',
  contactPhone: '+260971000000',
  website: 'https://example.com',
  timezone: 'Africa/Lusaka',
  businessHours: 'Mon-Fri 08:00-17:00',
  faqs: [{ question: 'Where are you?', answer: '14 Lake Road.' }],
  products: 'Cleaning $45',
  appointmentInstructions: 'Take a callback number.',
  escalationContact: 'Manager +260971111111',
};

test('system prompt carries business facts, guardrails and the agent language', () => {
  const prompt = buildSystemPrompt(agent, workspace);
  assert.ok(prompt.includes('Lakeside Dental'));
  assert.ok(prompt.includes('14 Lake Road'));
  assert.ok(prompt.includes('Cleaning $45'));
  assert.ok(prompt.includes('hello@example.com'));
  assert.ok(prompt.includes('en-GB'));
  assert.ok(prompt.includes(GUARDRAILS));
  // Both agent and workspace FAQs must be present.
  assert.ok(prompt.includes('Do you open on Saturday?'));
  assert.ok(prompt.includes('Where are you?'));
});

test('system prompt forbids inventing facts and requires a handoff', () => {
  const prompt = buildSystemPrompt(agent, null).toLowerCase();
  assert.ok(prompt.includes('never invent prices'));
  assert.ok(prompt.includes('have that information'));
  assert.ok(prompt.includes('connect them with a person'));
});

test('agent hours override workspace hours', () => {
  const prompt = buildSystemPrompt({ ...agent, businessHours: 'Weekends only' }, workspace);
  assert.ok(prompt.includes('Weekends only'));
});

test('chat messages are capped to the last 20 history entries plus the system prompt', () => {
  const history = Array.from({ length: 30 }, (_, index) => ({
    role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `message ${index}`,
  }));
  const messages = buildChatMessages(agent, workspace, history, 'latest question');
  assert.equal(messages.length, 22);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].content, 'message 10');
  assert.equal(messages[messages.length - 1].content, 'latest question');
});

test('sanitiseSpokenReply strips markdown, lists and emoji', () => {
  const raw = '**Sure!** Here you go:\n- first item\n- second item 🎉\n\n```js\ncode\n```';
  const cleaned = sanitiseSpokenReply(raw);
  assert.ok(!cleaned.includes('**'));
  assert.ok(!cleaned.includes('🎉'));
  assert.ok(!cleaned.includes('```'));
  assert.ok(!/^\s*-\s/m.test(cleaned));
  assert.ok(cleaned.startsWith('Sure!'));
});

test('sanitiseSpokenReply keeps ordinary punctuation', () => {
  assert.equal(sanitiseSpokenReply('We open at 9am. Would you like directions?'), 'We open at 9am. Would you like directions?');
});
