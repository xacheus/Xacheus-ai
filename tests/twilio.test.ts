import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVoiceTwiml,
  mapTwilioStatus,
  resolveWebhookUrl,
  telephonyStatusReason,
  telephonyUsable,
  validateTwilioSignature,
} from '../src/lib/telephony/twilio';

/**
 * Vector published in Twilio's request-validation documentation.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
const DOCS_VECTOR = {
  authToken: '12345',
  url: 'https://mycompany.com/myapp.php?foo=1&bar=2',
  params: {
    CallSid: 'CA1234567890ABCDE',
    Caller: '+12349013030',
    Digits: '1234',
    From: '+12349013030',
    To: '+18005551212',
  },
  signature: '0/KCTR6DLpKmkAf8muzZqo1nDgQ=',
};

test('validates the published Twilio signature vector', () => {
  assert.equal(validateTwilioSignature(DOCS_VECTOR), true);
});

test('rejects a tampered payload, wrong token and empty signature', () => {
  assert.equal(
    validateTwilioSignature({ ...DOCS_VECTOR, params: { ...DOCS_VECTOR.params, Digits: '9999' } }),
    false,
  );
  assert.equal(validateTwilioSignature({ ...DOCS_VECTOR, authToken: 'wrong-token' }), false);
  assert.equal(validateTwilioSignature({ ...DOCS_VECTOR, signature: '' }), false);
});

test('maps provider statuses to the call-record vocabulary', () => {
  assert.equal(mapTwilioStatus('queued'), 'queued');
  assert.equal(mapTwilioStatus('initiated'), 'queued');
  assert.equal(mapTwilioStatus('ringing'), 'ringing');
  assert.equal(mapTwilioStatus('in-progress'), 'in-progress');
  assert.equal(mapTwilioStatus('completed'), 'completed');
  assert.equal(mapTwilioStatus('no-answer'), 'no-answer');
  assert.equal(mapTwilioStatus('busy'), 'busy');
  assert.equal(mapTwilioStatus('canceled'), 'canceled');
  assert.equal(mapTwilioStatus('failed'), 'failed');
  assert.equal(mapTwilioStatus('something-new'), 'failed');
});

test('TwiML without a gateway clearly states calling is unavailable', () => {
  const xml = buildVoiceTwiml({ greeting: 'Thank you for calling <Lakeside> & Co.' });
  assert.ok(xml.startsWith('<?xml'));
  assert.ok(xml.includes('&lt;Lakeside&gt; &amp; Co.'));
  assert.ok(xml.includes('not accepting voice calls yet'));
  assert.ok(xml.includes('<Hangup />'));
  assert.ok(!xml.includes('<Connect>'));
});

test('TwiML with a websocket gateway returns a media stream', () => {
  const xml = buildVoiceTwiml({ greeting: 'Please hold.', streamUrl: 'wss://voice.example.com/stream' });
  assert.ok(xml.includes('<Connect>'));
  assert.ok(xml.includes('<Stream url="wss://voice.example.com/stream" />'));
  assert.ok(!xml.includes('not accepting voice calls'));
});

test('calling stays disabled without configuration', () => {
  assert.equal(telephonyUsable(), false);
  assert.match(telephonyStatusReason() || '', /Twilio credentials are not configured/);
});


test('webhook URL prefers the configured public base and keeps the query string', () => {
  const request = new Request('https://internal:3000/api/telephony/twilio/voice?agentId=a1&ownerId=u1');
  assert.equal(
    resolveWebhookUrl(request, 'https://voice.example.com', '/api/telephony/twilio/voice'),
    'https://voice.example.com/api/telephony/twilio/voice?agentId=a1&ownerId=u1',
  );
});

test('webhook URL falls back to forwarded headers behind a proxy', () => {
  const request = new Request('https://internal:3000/api/telephony/twilio/status', {
    headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'app.example.com' },
  });
  assert.equal(
    resolveWebhookUrl(request, '', '/api/telephony/twilio/status'),
    'https://app.example.com/api/telephony/twilio/status',
  );
});
