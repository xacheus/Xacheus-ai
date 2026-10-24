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
import { getFirestore, initializeFirestore, type Firestore } from 'firebase-admin/firestore';
import { firebaseWebConfig, serverEnv } from '@/lib/env';

export class AdminNotConfiguredError extends Error {
  readonly code = 'admin_not_configured';
  constructor(message = 'Firebase Admin credentials are not configured.') {
    super(message);
    this.name = 'AdminNotConfiguredError';
  }
}

function currentProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    serverEnv.projectId ||
    firebaseWebConfig.projectId
  ).trim();
}

function currentServiceAccountKey(): string {
  return (process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? serverEnv.serviceAccountKey).trim();
}

function currentServiceAccountFile(): string {
  return (process.env.FIREBASE_SERVICE_ACCOUNT_FILE ?? serverEnv.serviceAccountFile).trim();
}

function unwrapQuotedEnvValue(raw: string): string {
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).trim();
  }
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const unquoted = JSON.parse(raw);
      if (typeof unquoted === 'string') return unquoted.trim();
    } catch {
      return raw.slice(1, -1).trim();
    }
  }
  return raw;
}

function normalizeParsedServiceAccount(parsed: Record<string, unknown>): ServiceAccount {
  if (typeof parsed.private_key === 'string') {
    // Hosted env vars often store newlines escaped.
    parsed.private_key = parsed.private_key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  }

  const projectId =
    (typeof parsed.project_id === 'string' && parsed.project_id.trim()) ||
    (typeof parsed.projectId === 'string' && parsed.projectId.trim()) ||
    '';
  const clientEmail =
    (typeof parsed.client_email === 'string' && parsed.client_email.trim()) ||
    (typeof parsed.clientEmail === 'string' && parsed.clientEmail.trim()) ||
    '';
  const privateKey =
    (typeof parsed.private_key === 'string' && parsed.private_key.trim()) ||
    (typeof parsed.privateKey === 'string' && parsed.privateKey.trim()) ||
    '';

  if (!projectId || !clientEmail || !privateKey) {
    throw new AdminNotConfiguredError(
      'Service account JSON is missing project_id, client_email or private_key.',
    );
  }

  const expectedProjectId = currentProjectId();
  if (expectedProjectId && projectId !== expectedProjectId) {
    throw new AdminNotConfiguredError(
      `FIREBASE_SERVICE_ACCOUNT_KEY belongs to project "${projectId}", but this app is configured for "${expectedProjectId}".`,
    );
  }

  return {
    ...(parsed as Record<string, unknown>),
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
    projectId,
    clientEmail,
    privateKey,
  } as unknown as ServiceAccount;
}

export function parseServiceAccountInput(rawInput: string): ServiceAccount | null {
  const raw = unwrapQuotedEnvValue(rawInput.trim());
  if (!raw) return null;

  let json = raw;
  if (!raw.startsWith('{')) {
    // Support base64-encoded JSON (common on hosted platforms).
    try {
      json = Buffer.from(raw, 'base64').toString('utf8').trim();
    } catch {
      throw new AdminNotConfiguredError('FIREBASE_SERVICE_ACCOUNT_KEY is neither JSON nor base64 JSON.');
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AdminNotConfiguredError('FIREBASE_SERVICE_ACCOUNT_KEY could not be parsed as JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AdminNotConfiguredError('FIREBASE_SERVICE_ACCOUNT_KEY must be a JSON object.');
  }

  return normalizeParsedServiceAccount(parsed as Record<string, unknown>);
}

function loadServiceAccount(): ServiceAccount | null {
  const inline = parseServiceAccountInput(currentServiceAccountKey());
  if (inline) return inline;

  const serviceAccountFile = currentServiceAccountFile();
  if (serviceAccountFile) {
    // Reading a file on demand keeps this module import-safe during builds.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs') as typeof import('node:fs');
      const contents = fs.readFileSync(serviceAccountFile, 'utf8');
      const parsed = JSON.parse(contents) as Record<string, unknown>;
      return normalizeParsedServiceAccount(parsed);
    } catch (error) {
      if (error instanceof AdminNotConfiguredError) throw error;
      throw new AdminNotConfiguredError(
        `Unable to read FIREBASE_SERVICE_ACCOUNT_FILE: ${(error as Error).message}`,
      );
    }
  }
  return null;
}

let cachedApp: App | null = null;
let cachedDb: Firestore | null = null;

function adminApp(): App {
  if (cachedApp) return cachedApp;
  const existing = getApps()[0];
  if (existing) {
    cachedApp = existing;
    return existing;
  }
  const serviceAccount = loadServiceAccount();
  const projectId = serviceAccount?.projectId || currentProjectId();
  if (serviceAccount) {
    let credential;
    try {
      credential = cert(serviceAccount);
    } catch {
      throw new AdminNotConfiguredError(
        'FIREBASE_SERVICE_ACCOUNT_KEY contains an invalid private key. Paste the unmodified JSON from Firebase Console → Project settings → Service accounts.',
      );
    }
    cachedApp = initializeApp({ credential, projectId });
  } else {
    cachedApp = initializeApp({ projectId });
  }
  return cachedApp;
}

/** True when privileged Admin operations (Firestore writes) are available. */
export function hasAdminCredentials(): boolean {
  if (currentServiceAccountKey() || currentServiceAccountFile()) return true;
  if ((process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()) return true;
  return false;
}

export function getAdminAuth(): Auth {
  return getAuth(adminApp());
}

/**
 * Firestore handle for trusted server writes. Throws if credentials are absent.
 * Uses `preferRest: true` so serverless invocations communicate over stateless
 * HTTPS/1.1 instead of long-lived gRPC HTTP/2 channels that can stall or reset
 * across frozen serverless containers.
 */
export function getAdminDb(): Firestore {
  if (!hasAdminCredentials()) {
    throw new AdminNotConfiguredError(
      'Server-side metering requires a Firebase service account. Set FIREBASE_SERVICE_ACCOUNT_KEY (or FIREBASE_SERVICE_ACCOUNT_FILE) in the server environment.',
    );
  }
  if (cachedDb) return cachedDb;
  const app = adminApp();
  let db: Firestore;
  try {
    db = initializeFirestore(app, { preferRest: true });
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Settings are already frozen if Firestore was used earlier in this process.
    }
  } catch {
    db = getFirestore(app);
  }
  cachedDb = db;
  return db;
}

/** Best-effort readiness probe used by the health endpoint. */
export function adminReadiness(): 'ready' | 'credentials-missing' {
  return hasAdminCredentials() ? 'ready' : 'credentials-missing';
}
