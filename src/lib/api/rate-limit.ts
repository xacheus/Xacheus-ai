import { apiErrors } from './errors';

/**
 * Fixed-window rate limiter.
 *
 * This is an in-process limiter: it protects a single server instance and is
 * correct for development and single-region deployments. For multi-region /
 * serverless-at-scale deployments, swap the store for Redis or Firestore
 * (see docs/DEPLOYMENT.md). The interface is intentionally small so a swap is
 * a one-file change.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
let lastSweep = Date.now();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0, limit };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      limit,
    };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count, retryAfterSeconds: 0, limit };
}

/** Drop expired windows periodically to bound memory. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

/** Test helper. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = Date.now();
}

/** Convenience wrapper that throws a 429 ApiError when the limit is exceeded. */
export function enforceRateLimit(key: string, limit: number, windowMs = 60 * 60 * 1000) {
  const result = checkRateLimit({ key, limit, windowMs });
  if (!result.allowed) throw apiErrors.rateLimited(result.retryAfterSeconds);
  return result;
}
