import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { authenticateRequest, type TokenVerifier } from '../src/lib/api/auth';
import { ApiError } from '../src/lib/api/errors';

const decodedToken = {
  uid: 'user-123',
  email: 'amara@example.com',
  email_verified: true,
  name: 'Amara',
} as unknown as DecodedIdToken;

function request() {
  return new Request('https://example.test/api/agents', {
    headers: { authorization: 'Bearer test-id-token' },
  });
}

async function withAppCheckDisabled<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.APP_CHECK_ENFORCE;
  process.env.APP_CHECK_ENFORCE = 'false';
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.APP_CHECK_ENFORCE;
    else process.env.APP_CHECK_ENFORCE = previous;
  }
}

function verifier(
  hasCredentials: boolean,
  verifyIdToken: TokenVerifier['verifyIdToken'],
): TokenVerifier {
  return { hasAdminCredentials: () => hasCredentials, verifyIdToken };
}

test('auth verifies ID-token signatures without a revocation lookup in verification-only mode', async () => {
  await withAppCheckDisabled(async () => {
    let checkedRevocation: boolean | undefined;
    const user = await authenticateRequest(
      request(),
      verifier(false, async (token, checkRevoked) => {
        assert.equal(token, 'test-id-token');
        checkedRevocation = checkRevoked;
        return decodedToken;
      }),
    );

    assert.equal(checkedRevocation, false);
    assert.deepEqual(
      { uid: user.uid, email: user.email, emailVerified: user.emailVerified, displayName: user.displayName },
      { uid: 'user-123', email: 'amara@example.com', emailVerified: true, displayName: 'Amara' },
    );
  });
});

test('auth retains revocation checks when Firebase Admin credentials are available', async () => {
  await withAppCheckDisabled(async () => {
    let checkedRevocation: boolean | undefined;
    await authenticateRequest(
      request(),
      verifier(true, async (_token, checkRevoked) => {
        checkedRevocation = checkRevoked;
        return decodedToken;
      }),
    );
    assert.equal(checkedRevocation, true);
  });
});

test('invalid Firebase ID tokens still return an actionable 401', async () => {
  await withAppCheckDisabled(async () => {
    await assert.rejects(
      authenticateRequest(
        request(),
        verifier(true, async () => {
          throw Object.assign(new Error('invalid token'), { code: 'auth/invalid-id-token' });
        }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 401);
        assert.equal(error.code, 'unauthorized');
        assert.match(error.message, /sign in again/i);
        return true;
      },
    );
  });
});

test('Firebase Admin configuration errors are not misreported as user session failures', async () => {
  await withAppCheckDisabled(async () => {
    const originalError = console.error;
    console.error = () => undefined;
    try {
      await assert.rejects(
        authenticateRequest(
          request(),
          verifier(true, async () => {
            throw Object.assign(new Error('invalid server credential'), { code: 'app/invalid-credential' });
          }),
        ),
        (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, 503);
          assert.equal(error.code, 'admin_not_configured');
          assert.doesNotMatch(error.message, /sign in again/i);
          assert.match(error.hint || '', /FIREBASE_SERVICE_ACCOUNT_KEY/);
          return true;
        },
      );
    } finally {
      console.error = originalError;
    }
  });
});

test('unexpected Firebase verification failures are reported as retryable service errors', async () => {
  await withAppCheckDisabled(async () => {
    const originalError = console.error;
    console.error = () => undefined;
    try {
      await assert.rejects(
        authenticateRequest(
          request(),
          verifier(true, async () => {
            throw Object.assign(new Error('temporary Auth API failure'), { code: 'auth/internal-error' });
          }),
        ),
        (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, 503);
          assert.equal(error.code, 'auth_unavailable');
          assert.doesNotMatch(error.message, /sign in again/i);
          return true;
        },
      );
    } finally {
      console.error = originalError;
    }
  });
});
