#!/usr/bin/env node
/**
 * VOICEPILOT AI — environment doctor.
 *
 * Verifies configuration without printing secret values. Run:
 *   node scripts/doctor.mjs
 *   node scripts/doctor.mjs --live   (also calls Groq to verify the key + models)
 */

import fs from 'node:fs';

const LIVE = process.argv.includes('--live');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  const contents = fs.readFileSync(file, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

const loaded = [];
for (const file of ['.env.local', '.env']) {
  if (loadEnvFile(file)) loaded.push(file);
}

const results = [];
function check({ label, ok, detail, fix, required = true }) {
  results.push({ label, ok, detail, fix, required });
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
check({
  label: 'Node.js version',
  ok: nodeMajor === 24 && Number(process.versions.node.split('.')[1]) >= 12,
  detail: process.versions.node,
  fix: 'Use Node.js 24.12 or newer within the 24.x LTS release (also used on Vercel).',
});

check({
  label: 'Environment file',
  ok: loaded.length > 0,
  detail: loaded.length ? loaded.join(', ') : 'none found (system environment only)',
  fix: 'Copy .env.example to .env.local for local development.',
  required: false,
});

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'xacheus-ai';
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCXKhOJYmmYz2Aqyv1powJuUaJHAySI87o';
check({
  label: 'Firebase web configuration',
  ok: Boolean(apiKey && projectId),
  detail: `project ${projectId}`,
  fix: 'Set NEXT_PUBLIC_FIREBASE_* values in .env.local.',
});

const groqKey = process.env.GROQ_API_KEY || '';
check({
  label: 'GROQ_API_KEY (server only)',
  ok: groqKey.length > 20 && groqKey.startsWith('gsk_'),
  detail: groqKey ? 'present (value hidden)' : 'missing',
  fix: 'Create a key at console.groq.com/keys and set GROQ_API_KEY in the server environment.',
});

let serviceAccount = null;
const rawServiceAccount = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim();
const serviceAccountFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE || '';

if (rawServiceAccount || serviceAccountFile) {
  try {
    let json = rawServiceAccount;
    if (json && !json.startsWith('{')) json = Buffer.from(json, 'base64').toString('utf8');
    if (json) {
      serviceAccount = JSON.parse(json);
    } else if (serviceAccountFile && fs.existsSync(serviceAccountFile)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountFile, 'utf8'));
    }
    const valid = Boolean(
      serviceAccount?.project_id && serviceAccount?.client_email && serviceAccount?.private_key,
    );
    check({
      label: 'Firebase Admin credentials',
      ok: valid,
      detail: valid
        ? `service account ${serviceAccount.client_email} · project ${serviceAccount.project_id}`
        : 'JSON parsed but required fields are missing',
      fix: 'Download a service account key (Firebase Console → Project settings → Service accounts) and paste the JSON into FIREBASE_SERVICE_ACCOUNT_KEY.',
    });
  } catch {
    check({
      label: 'Firebase Admin credentials',
      ok: false,
      detail: 'could not parse service-account configuration (value hidden)',
      fix: 'Ensure the value is raw service-account JSON (or base64 of it) on a single line.',
    });
  }
} else {
  check({
    label: 'Firebase Admin credentials',
    ok: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    detail: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? 'using GOOGLE_APPLICATION_CREDENTIALS'
      : 'missing — API routes, usage metering and agent creation will be blocked',
    fix: 'Set FIREBASE_SERVICE_ACCOUNT_KEY (or FIREBASE_SERVICE_ACCOUNT_FILE).',
  });
}

const twilio = {
  sid: Boolean(process.env.TWILIO_ACCOUNT_SID),
  token: Boolean(process.env.TWILIO_AUTH_TOKEN),
  number: Boolean(process.env.TWILIO_PHONE_NUMBER),
  webhook: Boolean(process.env.TWILIO_WEBHOOK_BASE_URL),
  enabled: (process.env.TELEPHONY_CALLING_ENABLED || 'false') === 'true',
};
const telephonyParts = Object.values(twilio).filter(Boolean).length;
check({
  label: 'Telephony (optional)',
  ok: telephonyParts === 0 || (twilio.sid && twilio.token && twilio.number),
  detail:
    telephonyParts === 0
      ? 'not configured — calling stays disabled (expected)'
      : `sid ${twilio.sid ? 'set' : 'missing'}, token ${twilio.token ? 'set' : 'missing'}, number ${twilio.number ? 'set' : 'missing'}, webhook ${twilio.webhook ? 'set' : 'missing'}, enabled ${twilio.enabled}`,
  fix: 'Set all TWILIO_* variables, deploy a voice gateway, then set TELEPHONY_CALLING_ENABLED=true.',
  required: false,
});

check({
  label: 'Firebase App Check (optional)',
  ok: Boolean(process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY),
  detail: process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY ? 'site key set' : 'disabled',
  fix: 'Register a reCAPTCHA v3 site key and set NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY.',
  required: false,
});

// Report
console.log('\nVOICEPILOT AI — configuration check\n');
for (const result of results) {
  const mark = result.ok ? '✓' : result.required ? '✗' : '!';
  console.log(`${mark} ${result.label}: ${result.detail}`);
  if (!result.ok && result.fix) console.log(`    → ${result.fix}`);
}

const blocking = results.filter((result) => result.required && !result.ok);
console.log(
  `\n${blocking.length === 0 ? 'Core configuration looks complete.' : `${blocking.length} required item(s) need attention.`}`,
);
console.log('Telephone calling is not tested by this script and remains disabled unless explicitly enabled.\n');

if (LIVE) {
  if (!groqKey) {
    console.log('--live skipped: GROQ_API_KEY is missing.\n');
    process.exit(blocking.length === 0 ? 0 : 1);
  }
  const base = (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  console.log(`Live check: querying ${base}/models …`);
  try {
    const response = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${groqKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.log(`✗ Groq rejected the request with status ${response.status}.\n`);
      process.exit(1);
    }
    const payload = await response.json();
    const ids = new Set((payload.data || []).map((model) => model.id));
    const textModel = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';
    const whisperModel = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';
    console.log(`✓ ${ids.size} models available.`);
    console.log(`${ids.has(textModel) ? '✓' : '✗'} text model ${textModel}`);
    console.log(`${ids.has(whisperModel) ? '✓' : '✗'} whisper model ${whisperModel}\n`);
    if (!ids.has(textModel) || !ids.has(whisperModel)) process.exit(1);
  } catch (error) {
    console.log(`✗ Live check failed: ${error.message}\n`);
    process.exit(1);
  }
}

process.exit(blocking.length === 0 ? 0 : 1);
