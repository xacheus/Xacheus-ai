import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLANS, formatPrice, getPlan, planLimits } from '../src/lib/plans';
import { estimateChatCostUsd, estimateTranscriptionCostUsd, formatUsd } from '../src/lib/pricing';

test('catalogue exposes the four proposed plans', () => {
  assert.deepEqual(PLANS.map((plan) => plan.id), ['starter', 'business', 'professional', 'enterprise']);
  assert.equal(getPlan('business').priceMonthlyUsd, 19);
  assert.equal(getPlan('professional').priceMonthlyUsd, 79);
  assert.equal(getPlan('enterprise').priceMonthlyUsd, null);
  assert.equal(getPlan('unknown-plan').id, 'starter');
});

test('starter limits are finite and enforced', () => {
  const limits = planLimits('starter');
  assert.ok(limits);
  assert.equal(limits.agents, 1);
  assert.equal(limits.callMinutesPerMonth, 0);
  assert.ok((limits.transcriptionSecondsPerMonth ?? 0) > 0);
  assert.ok((limits.chatRequestsPerMonth ?? 0) > 0);
});

test('paid plan limits are larger than starter', () => {
  const starter = planLimits('starter');
  const business = planLimits('business');
  assert.ok((business?.agents ?? 0) > (starter?.agents ?? 0));
  assert.ok((business?.transcriptionSecondsPerMonth ?? 0) > (starter?.transcriptionSecondsPerMonth ?? 0));
});

test('price formatting handles free and custom plans', () => {
  assert.equal(formatPrice(getPlan('starter')), '$0');
  assert.equal(formatPrice(getPlan('business')), '$19');
  assert.equal(formatPrice(getPlan('enterprise')), 'Custom');
});

test('transcription cost uses the turbo hourly rate', () => {
  // 3600 seconds at $0.04/hour = $0.04
  assert.equal(estimateTranscriptionCostUsd('whisper-large-v3-turbo', 3600), 0.04);
  // Half an hour
  assert.equal(estimateTranscriptionCostUsd('whisper-large-v3-turbo', 1800), 0.02);
  // Non-turbo model uses the higher published rate
  assert.equal(estimateTranscriptionCostUsd('whisper-large-v3', 3600), 0.111);
});

test('short clips are estimated at the 10-second billing minimum', () => {
  const threeSeconds = estimateTranscriptionCostUsd('whisper-large-v3-turbo', 3);
  const tenSeconds = estimateTranscriptionCostUsd('whisper-large-v3-turbo', 10);
  assert.equal(threeSeconds, tenSeconds);
  assert.ok(threeSeconds > 0);
});

test('chat cost uses published token prices for the default model', () => {
  const cost = estimateChatCostUsd('openai/gpt-oss-120b', 1_000_000, 1_000_000);
  assert.equal(cost, 0.75); // 0.15 + 0.60
  assert.equal(estimateChatCostUsd('openai/gpt-oss-20b', 1_000_000, 1_000_000), 0.375);
  assert.equal(estimateChatCostUsd('unknown-model', 1000, 1000), 0);
});

test('USD formatting shows precision for tiny amounts', () => {
  assert.equal(formatUsd(0), '$0.00');
  assert.equal(formatUsd(0.0004), '$0.0004');
  assert.equal(formatUsd(2.5), '$2.50');
});
