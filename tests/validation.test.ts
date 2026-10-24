import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agentInputSchema,
  agentPatchSchema,
  chatRequestSchema,
  outboundCallSchema,
  retentionSchema,
  workspaceInputSchema,
} from '../src/lib/api/validation';
import { checkRateLimit, resetRateLimits } from '../src/lib/api/rate-limit';

test('agent schema applies safe defaults', () => {
  const parsed = agentInputSchema.parse({ name: 'Reception' });
  assert.equal(parsed.language, 'en-US');
  assert.equal(parsed.status, 'active');
  assert.equal(parsed.voiceProvider, 'browser');
  assert.equal(parsed.speakingRate, 1);
  assert.deepEqual(parsed.faqs, []);
});

test('agent schema rejects short names and bad transfer numbers', () => {
  assert.equal(agentInputSchema.safeParse({ name: 'x' }).success, false);
  assert.equal(
    agentInputSchema.safeParse({ name: 'Reception', transferNumber: 'not-a-number' }).success,
    false,
  );
  assert.equal(
    agentInputSchema.safeParse({ name: 'Reception', transferNumber: '+260971234567' }).success,
    true,
  );
});

test('patch schema allows partial updates only', () => {
  assert.equal(agentPatchSchema.safeParse({ status: 'inactive' }).success, true);
  assert.equal(agentPatchSchema.safeParse({ status: 'deleted' }).success, false);
});

test('workspace schema validates email or allows empty', () => {
  assert.equal(workspaceInputSchema.safeParse({ name: 'Acme', contactEmail: '' }).success, true);
  assert.equal(workspaceInputSchema.safeParse({ name: 'Acme', contactEmail: 'bad' }).success, false);
});

test('chat schema requires a message and caps history', () => {
  assert.equal(chatRequestSchema.safeParse({ agentId: 'a', message: 'hi' }).success, true);
  assert.equal(chatRequestSchema.safeParse({ agentId: 'a', message: '' }).success, false);
  const longHistory = Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' }));
  assert.equal(chatRequestSchema.safeParse({ agentId: 'a', message: 'hi', history: longHistory }).success, false);
});

test('outbound calling requires E.164 and explicit consent', () => {
  assert.equal(outboundCallSchema.safeParse({ agentId: 'a', toNumber: '+260971234567', consentConfirmed: true }).success, true);
  assert.equal(outboundCallSchema.safeParse({ agentId: 'a', toNumber: '0971234567', consentConfirmed: true }).success, false);
  assert.equal(outboundCallSchema.safeParse({ agentId: 'a', toNumber: '+260971234567', consentConfirmed: false }).success, false);
});

test('retention window is bounded', () => {
  assert.equal(retentionSchema.safeParse({ retentionDays: 30 }).success, true);
  assert.equal(retentionSchema.safeParse({ retentionDays: 0 }).success, false);
  assert.equal(retentionSchema.safeParse({ retentionDays: 999 }).success, false);
});

test('rate limiter allows up to the limit then blocks with retry information', () => {
  resetRateLimits();
  const key = 'test:user';
  for (let index = 0; index < 3; index += 1) {
    assert.equal(checkRateLimit({ key, limit: 3, windowMs: 60_000 }).allowed, true);
  }
  const blocked = checkRateLimit({ key, limit: 3, windowMs: 60_000 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.equal(blocked.remaining, 0);
});

test('rate limiter isolates different keys', () => {
  resetRateLimits();
  checkRateLimit({ key: 'a', limit: 1, windowMs: 60_000 });
  assert.equal(checkRateLimit({ key: 'a', limit: 1, windowMs: 60_000 }).allowed, false);
  assert.equal(checkRateLimit({ key: 'b', limit: 1, windowMs: 60_000 }).allowed, true);
});

test('audio validation accepts supported formats and rejects unusable files', () => {
  const { validateAudioFile } = require('../src/lib/api/audio-validation') as typeof import('../src/lib/api/audio-validation');

  assert.equal(validateAudioFile({ name: 'clip.webm', size: 120_000, type: 'audio/webm' }).ok, true);
  assert.equal(validateAudioFile({ name: 'clip.mp3', size: 120_000, type: '' }).ok, true);
  assert.equal(validateAudioFile({ name: 'recording', size: 120_000, type: 'audio/mp4' }).ok, true);
  assert.equal(validateAudioFile({ name: 'clip.webm', size: 120_000, type: 'application/octet-stream' }).ok, true);

  const empty = validateAudioFile({ name: 'clip.webm', size: 0, type: 'audio/webm' });
  assert.equal(empty.ok, false);
  assert.equal(empty.ok === false && empty.code, 'bad_request');

  const tiny = validateAudioFile({ name: 'clip.webm', size: 10, type: 'audio/webm' });
  assert.equal(tiny.ok === false && tiny.status, 400);

  const huge = validateAudioFile({ name: 'clip.wav', size: 26 * 1024 * 1024, type: 'audio/wav' });
  assert.equal(huge.ok === false && huge.status, 413);
  assert.equal(huge.ok === false && huge.code, 'payload_too_large');

  const exe = validateAudioFile({ name: 'malware.exe', size: 90_000, type: 'application/x-msdownload' });
  assert.equal(exe.ok === false && exe.status, 415);
  assert.equal(exe.ok === false && exe.code, 'unsupported_media_type');
});
