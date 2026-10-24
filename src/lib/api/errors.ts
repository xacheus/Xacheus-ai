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

/** Convert any thrown value into a safe JSON error response. */
export function errorResponse(error: unknown, requestId: string): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
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

  const isAdminError =
    error instanceof Error && (error as { code?: string }).code === 'admin_not_configured';

  if (isAdminError) {
    return NextResponse.json(
      {
        error: {
          code: 'admin_not_configured' as ApiErrorCode,
          message: (error as Error).message,
          hint: 'Add FIREBASE_SERVICE_ACCOUNT_KEY to the server environment to enable metered features.',
        },
        requestId,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Never leak stack traces or provider payloads to the browser.
  console.error(`[api:${requestId}] unhandled`, error instanceof Error ? error.message : error);
  return NextResponse.json(
    { error: { code: 'internal_error' as ApiErrorCode, message: 'Something went wrong on our side.' }, requestId },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
