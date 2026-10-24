import type { NextRequest } from 'next/server';
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

const APP_CHECK_HEADER = 'x-firebase-appcheck';

/**
 * Verify the Firebase ID token presented in the Authorization header.
 * Token verification uses Google's public certificates, so it works even when
 * no service-account credentials are configured.
 */
export async function authenticateRequest(request: NextRequest | Request): Promise<AuthedUser> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw apiErrors.unauthorized('Sign in to continue.');

  await assertAppCheckIfEnforced(request);

  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      displayName: (decoded.name as string | undefined) ?? null,
      claims: decoded as unknown as Record<string, unknown>,
      token,
    };
  } catch (error) {
    const code = (error as { code?: string }).code || '';
    if (code === 'auth/id-token-expired') {
      throw apiErrors.unauthorized('Your session expired. Sign in again.');
    }
    if (code === 'auth/argument-error' || code === 'auth/invalid-id-token') {
      throw apiErrors.unauthorized('Invalid session token. Sign in again.');
    }
    if (!hasAdminCredentials() && code === 'auth/invalid-credential') {
      throw apiErrors.unauthorized('Unable to verify your session right now.');
    }
    throw apiErrors.unauthorized('Session verification failed. Sign in again.');
  }
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
