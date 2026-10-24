import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import type { CallStatus } from '@/lib/types';

/**
 * Twilio telephony adapter.
 *
 * This code path is fully implemented against Twilio's public REST API, but it
 * has NOT been exercised against a live Twilio account in this environment.
 * It stays disabled unless credentials exist AND TELEPHONY_CALLING_ENABLED=true.
 */

export function telephonyConfigured(): boolean {
  return Boolean(serverEnv.twilioAccountSid && serverEnv.twilioAuthToken && serverEnv.twilioPhoneNumber);
}

export function telephonyUsable(): boolean {
  return telephonyConfigured() && serverEnv.telephonyCallingEnabled && Boolean(serverEnv.twilioWebhookBaseUrl);
}

export function telephonyStatusReason(): string | null {
  if (!telephonyConfigured()) {
    return 'Twilio credentials are not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER).';
  }
  if (!serverEnv.twilioWebhookBaseUrl) {
    return 'TWILIO_WEBHOOK_BASE_URL is missing, so Twilio cannot reach the voice webhook.';
  }
  if (!serverEnv.telephonyCallingEnabled) {
    return 'TELEPHONY_CALLING_ENABLED is false. Enable it only after an end-to-end test with a verified number.';
  }
  return null;
}

/**
 * Reconstruct the URL Twilio actually requested. Signature validation fails if
 * this differs from the configured webhook URL, so prefer the explicit public
 * base URL and fall back to forwarded headers when running behind a proxy.
 */
export function resolveWebhookUrl(request: Request, baseUrl: string, path: string): string {
  const url = new URL(request.url);
  if (baseUrl) return `${baseUrl.replace(/\/$/, '')}${path}${url.search}`;
  const proto = (request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).split(',')[0].trim();
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host)
    .split(',')[0]
    .trim();
  return `${proto}://${host}${path}${url.search}`;
}

/** Twilio request signature validation (HMAC-SHA1 over URL + sorted params). */
export function validateTwilioSignature(options: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  const { authToken, url, params, signature } = options;
  if (!authToken || !signature) return false;

  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function mapTwilioStatus(status: string): CallStatus {
  switch (status) {
    case 'queued':
    case 'initiated':
      return 'queued';
    case 'ringing':
      return 'ringing';
    case 'in-progress':
    case 'answered':
      return 'in-progress';
    case 'completed':
      return 'completed';
    case 'busy':
      return 'busy';
    case 'no-answer':
      return 'no-answer';
    case 'canceled':
      return 'canceled';
    case 'failed':
      return 'failed';
    default:
      return 'failed';
  }
}

export interface OutboundCallResult {
  providerCallId: string;
  status: CallStatus;
}

/**
 * Place one outbound call. Requires explicit user action — never called from
 * cron jobs or automatically.
 */
export async function createOutboundCall(options: {
  to: string;
  agentId: string;
  ownerId: string;
}): Promise<OutboundCallResult> {
  const reason = telephonyStatusReason();
  if (reason) throw new Error(reason);

  const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber, twilioWebhookBaseUrl } = serverEnv;
  const callbackBase = `${twilioWebhookBaseUrl}/api/telephony/twilio`;
  const params = new URLSearchParams({
    To: options.to,
    From: twilioPhoneNumber,
    Url: `${callbackBase}/voice?agentId=${encodeURIComponent(options.agentId)}&ownerId=${encodeURIComponent(options.ownerId)}`,
    StatusCallback: `${callbackBase}/status`,
    StatusCallbackEvent: 'initiated ringing answered completed',
    StatusCallbackMethod: 'POST',
    MachineDetection: 'Enable',
    Timeout: '30',
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioAccountSid)}/Calls.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.warn('[twilio:outbound] rejected', { status: response.status });
    throw new Error(`Twilio rejected the call request (status ${response.status}). ${text.slice(0, 200)}`);
  }

  const json = (await response.json()) as { sid?: string; status?: string };
  return {
    providerCallId: json.sid || '',
    status: mapTwilioStatus(json.status || 'queued'),
  };
}

/**
 * TwiML returned to Twilio when a call connects.
 *
 * A production deployment points `<Connect><Stream>` at a bidirectional media
 * websocket that bridges audio to speech-to-text, the LLM and text-to-speech.
 * Until that gateway is deployed and verified, the honest behaviour is to state
 * that calling is not yet available and hang up — never to imply a live agent.
 */
export function buildVoiceTwiml(options: {
  greeting: string;
  streamUrl?: string | null;
}): string {
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  if (options.streamUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escape(options.greeting)}</Say>
  <Connect>
    <Stream url="${escape(options.streamUrl)}" />
  </Connect>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escape(options.greeting)}</Say>
  <Say voice="Polly.Joanna">This line is not accepting voice calls yet. Please contact the business directly. Goodbye.</Say>
  <Hangup />
</Response>`;
}

export function xmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
