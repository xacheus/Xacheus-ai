import type { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAdminAuth, hasAdminCredentials } from '@/lib/firebase/admin';
import { apiErrors } from './errors';

export interface AuthedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  claims: Record<string, unknown>;
  token: string;
}

export interface AdminUser extends AuthedUser {
  isAdmin: true;
}

/** Injectable Firebase verifier keeps auth policy testable without network calls. */
export interface TokenVerifier {
  hasAdminCredentials(): boolean;
  verifyIdToken(token: string, checkRevoked: boolean): Promise<DecodedIdToken>;
}

const firebaseTokenVerifier: TokenVerifier = {
  hasAdminCredentials,
  verifyIdToken: (token, checkRevoked) => getAdminAuth().verifyIdToken(token, checkRevoked),
};

const APP_CHECK_HEADER = 'x-firebase-appcheck';

/**
 * Verify the Firebase ID token presented in the Authorization header.
 * Token signatures are verified with Google's public certificates. Revocation
 * checks are enabled when Admin credentials are configured; signature-only
 * verification keeps the documented verification-only mode working without a
 * service account (privileged database operations still require credentials).
 */
export async function authenticateRequest(
  request: NextRequest | Request,
  verifier: TokenVerifier = firebaseTokenVerifier,
): Promise<AuthedUser> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw apiErrors.unauthorized('Sign in to continue.');

  await assertAppCheckIfEnforced(request);

  const checkRevoked = verifier.hasAdminCredentials();
  try {
    const decoded = await verifier.verifyIdToken(token, checkRevoked);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      displayName: (decoded.name as string | undefined) ?? null,
      claims: decoded as unknown as Record<string, unknown>,
      token,
    };
  } catch (error) {
    const code = getFirebaseErrorCode(error);
    if (
      code === 'auth/id-token-expired' ||
      code === 'auth/id-token-revoked' ||
      code === 'auth/user-not-found'
    ) {
      throw apiErrors.unauthorized('Your session is no longer valid. Sign in again.');
    }
    if (code === 'auth/user-disabled') {
      throw apiErrors.forbidden('This account has been disabled. Contact support.');
    }
    if (code === 'auth/argument-error' || code === 'auth/invalid-id-token') {
      throw apiErrors.unauthorized('Invalid session token. Sign in again.');
    }

    if (
      code === 'admin_not_configured' ||
      code === 'app/invalid-credential' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/insufficient-permission' ||
      code === 'auth/project-not-found' ||
      code === 'auth/invalid-config'
    ) {
      console.error(`[auth] Firebase Admin configuration error (${code}).`);
      throw apiErrors.adminNotConfigured(
        'Firebase Admin could not verify your session.',
        'Check FIREBASE_SERVICE_ACCOUNT_KEY, FIREBASE_PROJECT_ID, and that the service account has Firebase Authentication access.',
      );
    }

    console.error(`[auth] Firebase session verification failed (${code || 'unknown'}).`);
    throw apiErrors.authUnavailable();
  }
}

function getFirebaseErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

/**
 * App Check is optional. When `APP_CHECK_ENFORCE=true`, a valid App Check token
 * header is required in addition to Firebase Auth. Enable only after the web
 * site key is registered in the Firebase console.
 */
async function assertAppCheckIfEnforced(request: NextRequest | Request): Promise<void> {
  if ((process.env.APP_CHECK_ENFORCE || 'false') !== 'true') return;
  const token = request.headers.get(APP_CHECK_HEADER);
  if (!token) throw apiErrors.forbidden('App Check token missing.');

  const { getAppCheck } = await import('firebase-admin/app-check');
  try {
    await getAppCheck().verifyToken(token);
  } catch {
    throw apiErrors.forbidden('App Check verification failed.');
  }
}

/** Verified custom claim check. Users cannot grant themselves this claim. */
export async function requireAdmin(request: NextRequest | Request): Promise<AdminUser> {
  const user = await authenticateRequest(request);

  let isAdmin = user.claims.admin === true;
  if (!isAdmin) {
    // Re-read from the Admin SDK so a revoked claim takes effect immediately
    // and a forged client-side claim can never be trusted.
    if (hasAdminCredentials()) {
      const record = await getAdminAuth().getUser(user.uid);
      isAdmin = record.customClaims?.admin === true;
    }
  }
  if (!isAdmin) throw apiErrors.forbidden('Administrator access required.');
  return { ...user, isAdmin: true };
}

export function requireVerifiedEmail(user: AuthedUser) {
  if (!user.emailVerified) throw apiErrors.emailNotVerified();
}
