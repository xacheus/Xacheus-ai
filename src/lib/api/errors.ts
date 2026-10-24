import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'auth_unavailable'
  | 'email_not_verified'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'provider_not_configured'
  | 'admin_not_configured'
  | 'provider_error'
  | 'internal_error';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly hint?: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: { hint?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.hint = options.hint;
    this.details = options.details;
  }
}

export const apiErrors = {
  badRequest: (message: string, details?: unknown) =>
    new ApiError(400, 'bad_request', message, { details }),
  unauthorized: (message = 'You must be signed in to do that.') =>
    new ApiError(401, 'unauthorized', message),
  emailNotVerified: () =>
    new ApiError(403, 'email_not_verified', 'Verify your email address before using this feature.', {
      hint: 'Open the verification link Firebase emailed you, then sign in again.',
    }),
  forbidden: (message = 'You do not have access to this resource.') =>
    new ApiError(403, 'forbidden', message),
  notFound: (message = 'Not found.') => new ApiError(404, 'not_found', message),
  rateLimited: (retryAfterSeconds: number, message = 'Too many requests. Please slow down.') =>
    new ApiError(429, 'rate_limited', message, {
      details: { retryAfterSeconds },
      hint: `Try again in ${retryAfterSeconds} seconds.`,
    }),
  quotaExceeded: (message: string, details?: unknown) =>
    new ApiError(402, 'quota_exceeded', message, { details, hint: 'Upgrade your plan or wait for the next monthly reset.' }),
  providerNotConfigured: (message: string, hint?: string) =>
    new ApiError(503, 'provider_not_configured', message, { hint }),
  adminNotConfigured: (message: string, hint?: string) =>
    new ApiError(503, 'admin_not_configured', message, { hint }),
  authUnavailable: () =>
    new ApiError(503, 'auth_unavailable', 'We could not verify your session right now. Please try again.', {
      hint: 'If this keeps happening, contact the administrator to check Firebase Auth configuration.',
    }),
  providerError: (message: string, details?: unknown) =>
    new ApiError(502, 'provider_error', message, { details }),
  internal: (message = 'Something went wrong on our side.') =>
    new ApiError(500, 'internal_error', message),
};

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; hint?: string; details?: unknown };
  requestId: string;
}

function isApiErrorLike(error: unknown): error is ApiError {
  if (error instanceof ApiError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Partial<ApiError>;
  return (
    candidate.name === 'ApiError' &&
    typeof candidate.status === 'number' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
}

/**
 * Map known Firebase Admin / Cloud Firestore configuration and availability
 * errors into actionable, secret-safe `ApiError` responses so setup issues are
 * never hidden behind a generic 500 error.
 */
export function classifyBackendError(error: unknown): ApiError | null {
  if (typeof error !== 'object' || error === null) return null;

  const record = error as {
    code?: unknown;
    reason?: unknown;
    message?: unknown;
  };
  const rawCode = record.code;
  const codeStr = typeof rawCode === 'string' ? rawCode.toLowerCase() : '';
  const codeNum = typeof rawCode === 'number' ? rawCode : null;
  const reason = typeof record.reason === 'string' ? record.reason : '';
  const message = typeof record.message === 'string' ? record.message : '';

  if (codeStr === 'admin_not_configured') {
    return apiErrors.adminNotConfigured(
      message || 'Firebase Admin credentials are not configured.',
      'Add FIREBASE_SERVICE_ACCOUNT_KEY to the server environment to enable metered features.',
    );
  }

  // Invalid or revoked service-account credentials.
  if (
    codeStr === 'app/invalid-credential' ||
    codeStr === 'invalid-credential' ||
    codeStr === 'auth/invalid-credential' ||
    codeStr === 'unauthenticated' ||
    codeStr === 'firestore/unauthenticated' ||
    codeNum === 16 ||
    /invalid_grant|UNAUTHENTICATED/i.test(message)
  ) {
    return apiErrors.adminNotConfigured(
      'Firebase Admin credentials could not authenticate with Google Cloud.',
      'Generate a fresh key in Firebase Console → Project settings → Service accounts, update FIREBASE_SERVICE_ACCOUNT_KEY in the server environment, and redeploy.',
    );
  }

  // Firestore `(default)` database has not been created in the Firebase project yet.
  // Note: application-level 404s throw `ApiError` directly, and no server code
  // calls `docRef.update()`, so a backend NOT_FOUND (gRPC 5) from Firestore
  // indicates the `(default)` database itself does not exist.
  if (
    codeNum === 5 ||
    codeStr === 'not-found' ||
    codeStr === 'firestore/not-found' ||
    /database \(default\) does not exist|datastore\/setup/i.test(message)
  ) {
    return apiErrors.adminNotConfigured(
      'Cloud Firestore database has not been created for this Firebase project yet.',
      'Open Firebase Console → Build → Firestore Database → Create database (choose Standard / Native mode), then try again.',
    );
  }

  // Datastore Mode database instead of Firestore Native mode.
  if (/datastore mode/i.test(message)) {
    return apiErrors.adminNotConfigured(
      'This Firebase project database is in Datastore mode instead of Cloud Firestore Native mode.',
      'Switch the database to Firestore Native mode in Google Cloud Console, or use a project with Native-mode Cloud Firestore.',
    );
  }

  // Cloud Firestore API disabled vs IAM permission denied on the service account.
  if (
    codeNum === 7 ||
    codeStr === 'permission-denied' ||
    codeStr === 'firestore/permission-denied' ||
    codeStr === 'auth/insufficient-permission' ||
    reason === 'SERVICE_DISABLED' ||
    reason === 'IAM_PERMISSION_DENIED'
  ) {
    if (
      reason === 'SERVICE_DISABLED' ||
      /firestore\.googleapis\.com|Cloud Firestore API has not been used|API.*is disabled/i.test(message)
    ) {
      return apiErrors.adminNotConfigured(
        'The Cloud Firestore API is not enabled for this Firebase project.',
        'Open Firebase Console → Build → Firestore Database → Create database (or enable Cloud Firestore API in Google Cloud Console), wait a minute, and try again.',
      );
    }

    return apiErrors.adminNotConfigured(
      'The configured Firebase service account does not have permission to access Cloud Firestore.',
      'Grant the service account in FIREBASE_SERVICE_ACCOUNT_KEY the Firebase Admin or Cloud Datastore User role in Google Cloud IAM, then try again.',
    );
  }

  // Missing or still-building composite index (gRPC 9, or HTTP 400 -> code 3 over REST).
  if (
    (codeNum === 9 ||
      codeNum === 3 ||
      codeStr === 'failed-precondition' ||
      codeStr === 'firestore/failed-precondition') &&
    /requires an index|index.*building|currently building/i.test(message)
  ) {
    return apiErrors.adminNotConfigured(
      'A required Cloud Firestore index is missing or still building.',
      'Deploy firestore.indexes.json (firebase deploy --only firestore:indexes) and wait a few minutes for index creation to finish.',
    );
  }

  // Firestore quota / rate limits.
  if (
    codeNum === 8 ||
    codeStr === 'resource-exhausted' ||
    codeStr === 'firestore/resource-exhausted'
  ) {
    return apiErrors.rateLimited(
      30,
      'Database quota was temporarily exceeded. Please wait a moment and try again.',
    );
  }

  // Transient Firestore / network errors.
  if (
    codeNum === 14 ||
    codeNum === 4 ||
    codeNum === 10 ||
    codeStr === 'unavailable' ||
    codeStr === 'firestore/unavailable' ||
    codeStr === 'deadline-exceeded' ||
    codeStr === 'firestore/deadline-exceeded' ||
    codeStr === 'aborted' ||
    codeStr === 'firestore/aborted' ||
    /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(message)
  ) {
    return apiErrors.providerError(
      'Could not reach Cloud Firestore right now. Please try again in a moment.',
    );
  }

  return null;
}

/** Convert any thrown value into a safe JSON error response. */
export function errorResponse(error: unknown, requestId: string): NextResponse<ApiErrorBody> {
  if (isApiErrorLike(error)) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.hint ? { hint: error.hint } : {}),
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
        requestId,
      },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const classified = classifyBackendError(error);
  if (classified) {
    console.error(
      `[api:${requestId}] backend (${classified.code})`,
      error instanceof Error ? error.message : 'non-error failure',
    );
    return NextResponse.json(
      {
        error: {
          code: classified.code,
          message: classified.message,
          ...(classified.hint ? { hint: classified.hint } : {}),
          ...(classified.details !== undefined ? { details: classified.details } : {}),
        },
        requestId,
      },
      { status: classified.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Never leak stack traces or provider payloads to the browser.
  const rawCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : 'unknown';
  console.error(
    `[api:${requestId}] unhandled (${rawCode})`,
    error instanceof Error ? error.message : error,
  );
  return NextResponse.json(
    { error: { code: 'internal_error' as ApiErrorCode, message: 'Something went wrong on our side.' }, requestId },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
