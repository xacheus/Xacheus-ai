/**
 * Firebase Admin SDK (server only).
 *
 * Two modes:
 *  1. Full mode — `FIREBASE_SERVICE_ACCOUNT_KEY` (or `_FILE`) is present.
 *     Enables Firestore writes, usage metering, call records and admin APIs.
 *  2. Verification-only mode — no credentials. The SDK can still verify ID
 *     tokens (it uses Google's public certificates), but privileged reads and
 *     writes fail fast with an actionable configuration error.
 */

import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { serverEnv } from '@/lib/env';

export class AdminNotConfiguredError extends Error {
  readonly code = 'admin_not_configured';
  constructor(message = 'Firebase Admin credentials are not configured.') {
    super(message);
    this.name = 'AdminNotConfiguredError';
  }
}

function parseServiceAccount(): ServiceAccount | null {
  const raw = serverEnv.serviceAccountKey.trim();
  if (!raw) return null;

  let json = raw;
  if (!raw.startsWith('{')) {
    // Support base64-encoded JSON (common on hosted platforms).
    try {
      json = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      throw new AdminNotConfiguredError('FIREBASE_SERVICE_ACCOUNT_KEY is neither JSON nor base64 JSON.');
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AdminNotConfiguredError('FIREBASE_SERVICE_ACCOUNT_KEY could not be parsed as JSON.');
  }

  if (typeof parsed.private_key === 'string') {
    // Hosted env vars often store newlines escaped.
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new AdminNotConfiguredError(
      'Service account JSON is missing project_id, client_email or private_key.',
    );
  }
  return parsed as unknown as ServiceAccount;
}

function loadServiceAccount(): ServiceAccount | null {
  const inline = parseServiceAccount();
  if (inline) return inline;

  if (serverEnv.serviceAccountFile) {
    // Reading a file on demand keeps this module import-safe during builds.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs') as typeof import('node:fs');
      const contents = fs.readFileSync(serverEnv.serviceAccountFile, 'utf8');
      const parsed = JSON.parse(contents) as Record<string, unknown>;
      if (typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed as unknown as ServiceAccount;
    } catch (error) {
      throw new AdminNotConfiguredError(
        `Unable to read FIREBASE_SERVICE_ACCOUNT_FILE: ${(error as Error).message}`,
      );
    }
  }
  return null;
}

let cachedApp: App | null = null;

function adminApp(): App {
  if (cachedApp) return cachedApp;
  const existing = getApps()[0];
  if (existing) {
    cachedApp = existing;
    return existing;
  }
  const serviceAccount = loadServiceAccount();
  const projectId = serviceAccount?.projectId || serverEnv.projectId;
  cachedApp = serviceAccount
    ? initializeApp({ credential: cert(serviceAccount), projectId })
    : initializeApp({ projectId });
  return cachedApp;
}

/** True when privileged Admin operations (Firestore writes) are available. */
export function hasAdminCredentials(): boolean {
  if (serverEnv.serviceAccountKey.trim() || serverEnv.serviceAccountFile) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  return false;
}

export function getAdminAuth(): Auth {
  return getAuth(adminApp());
}

/** Firestore handle for trusted server writes. Throws if credentials are absent. */
export function getAdminDb(): Firestore {
  if (!hasAdminCredentials()) {
    throw new AdminNotConfiguredError(
      'Server-side metering requires a Firebase service account. Set FIREBASE_SERVICE_ACCOUNT_KEY (or FIREBASE_SERVICE_ACCOUNT_FILE) in the server environment.',
    );
  }
  return getFirestore(adminApp());
}

/** Best-effort readiness probe used by the health endpoint. */
export function adminReadiness(): 'ready' | 'credentials-missing' {
  return hasAdminCredentials() ? 'ready' : 'credentials-missing';
}
