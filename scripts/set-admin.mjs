#!/usr/bin/env node
/**
 * Grant or revoke the `admin` custom claim.
 *
 *   node scripts/set-admin.mjs admin@example.com
 *   node scripts/set-admin.mjs <uid> --revoke
 *
 * Requires server-only Firebase Admin credentials (FIREBASE_SERVICE_ACCOUNT_KEY
 * or FIREBASE_SERVICE_ACCOUNT_FILE). Never commit credentials. The claim is read
 * server-side on every admin request, so it cannot be forged from a browser.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const revoke = process.argv.includes('--revoke');
const identifier = args[0];

if (!identifier) {
  console.error('Usage: node scripts/set-admin.mjs <email-or-uid> [--revoke]');
  process.exit(1);
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

let credential = null;
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

try {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim();
  if (raw) {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed.private_key === 'string') parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    credential = cert(parsed);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_FILE) {
    const parsed = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8'));
    if (typeof parsed.private_key === 'string') parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    credential = cert(parsed);
  }
} catch (error) {
  console.error(`Could not read service account credentials: ${error.message}`);
  process.exit(1);
}

if (!credential) {
  console.error(
    'No Firebase Admin credentials found. Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_FILE.',
  );
  console.error('This script must run in a trusted environment — never in the browser.');
  process.exit(1);
}

const app = getApps().length ? getApps()[0] : initializeApp({ credential, projectId });

const auth = getAuth(app);

const user = identifier.includes('@')
  ? await auth.getUserByEmail(identifier).catch(() => null)
  : await auth.getUser(identifier).catch(() => null);

if (!user) {
  console.error(`No Firebase Authentication user found for "${identifier}".`);
  process.exit(1);
}

const existingClaims = user.customClaims || {};
const nextClaims = { ...existingClaims };

if (revoke) {
  delete nextClaims.admin;
} else {
  nextClaims.admin = true;
}

await auth.setCustomUserClaims(user.uid, nextClaims);

// Force token refresh so a revoked claim cannot linger for up to an hour.
await auth.revokeRefreshTokens(user.uid).catch(() => undefined);

console.log(`\n${revoke ? 'Revoked' : 'Granted'} administrator access for:`);
console.log(`  ${user.email || '(no email)'} · ${user.uid}`);
console.log(`  project: ${projectId || '(unknown)'}`);
console.log(`\nCustom claims now: ${JSON.stringify(nextClaims)}`);
console.log('The user must sign out and sign in again for the change to take effect.\n');
