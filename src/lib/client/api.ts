'use client';

import { getFirebaseAuth } from '@/lib/firebase/client';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint?: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, hint?: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

/** Authenticated JSON request with consistent error handling. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  for (const [key, value] of Object.entries(await authHeader())) headers.set(key, value);

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new ApiClientError(0, 'network_error', 'Could not reach the server. Check your connection.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const body = payload as
      | { error?: { code?: string; message?: string; hint?: string; details?: unknown } }
      | null;
    throw new ApiClientError(
      response.status,
      body?.error?.code || 'request_failed',
      body?.error?.message || 'The request failed. Try again.',
      body?.error?.hint,
      body?.error?.details,
    );
  }

  return payload as T;
}

/** Human-readable fallback for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
