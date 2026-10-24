import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import http from 'node:http';
import { test } from 'node:test';
import { classifyBackendError, errorResponse } from '../src/lib/api/errors';
import { AdminNotConfiguredError, getAdminDb, parseServiceAccountInput } from '../src/lib/firebase/admin';

test('missing Firestore default database maps to actionable 503 instead of generic 500', async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const err = Object.assign(
      new Error('5 NOT_FOUND: The database (default) does not exist for project xacheus-ai'),
      { code: 5 },
    );
    const response = errorResponse(err, 'req_test_not_found');
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, 'admin_not_configured');
    assert.match(body.error.message, /Cloud Firestore database has not been created/i);
    assert.match(body.error.hint || '', /Firestore Database/i);
    assert.doesNotMatch(body.error.message, /Something went wrong on our side/);
  } finally {
    console.error = originalError;
  }
});

test('disabled Firestore API and missing IAM permissions produce distinct setup guidance', () => {
  const disabled = classifyBackendError(
    Object.assign(
      new Error('Cloud Firestore API has not been used in project 381741784268 before or it is disabled.'),
      { code: 7, reason: 'SERVICE_DISABLED' },
    ),
  );
  assert.ok(disabled);
  assert.equal(disabled.status, 503);
  assert.equal(disabled.code, 'admin_not_configured');
  assert.match(disabled.message, /API is not enabled/i);

  const denied = classifyBackendError(
    Object.assign(new Error('Missing or insufficient permissions.'), { code: 7 }),
  );
  assert.ok(denied);
  assert.equal(denied.status, 503);
  assert.equal(denied.code, 'admin_not_configured');
  assert.match(denied.message, /permission to access Cloud Firestore/i);
});

test('Datastore mode, invalid credentials and transient unavailability are classified safely', async () => {
  const datastore = classifyBackendError(
    Object.assign(
      new Error('Cloud Firestore API is not available for Firestore in Datastore Mode.'),
      { code: 3 },
    ),
  );
  assert.ok(datastore);
  assert.equal(datastore.status, 503);
  assert.match(datastore.message, /Datastore mode/i);

  const unauth = classifyBackendError(
    Object.assign(new Error('16 UNAUTHENTICATED: invalid_grant'), { code: 16 }),
  );
  assert.ok(unauth);
  assert.equal(unauth.status, 503);
  assert.equal(unauth.code, 'admin_not_configured');

  const transient = classifyBackendError(
    Object.assign(new Error('14 UNAVAILABLE: upstream connect error'), { code: 14 }),
  );
  assert.ok(transient);
  assert.equal(transient.status, 502);
  assert.equal(transient.code, 'provider_error');

  // Truly unknown errors remain opaque 500s without leaking internal text.
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const unknown = errorResponse(new Error('secret-internal-detail-sentinel'), 'req_unknown');
    assert.equal(unknown.status, 500);
    const payload = await unknown.json();
    assert.equal(payload.error.code, 'internal_error');
    assert.equal(payload.error.message, 'Something went wrong on our side.');
    assert.ok(!JSON.stringify(payload).includes('secret-internal-detail-sentinel'));
  } finally {
    console.error = originalError;
  }
});

test('service account parser normalizes projectId, unwraps quotes and rejects project mismatches', () => {
  const prevProject = process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = 'xacheus-ai';
  try {
    const rawJson = JSON.stringify({
      type: 'service_account',
      project_id: 'xacheus-ai',
      client_email: 'svc@xacheus-ai.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nFAKEKEY\\n-----END PRIVATE KEY-----\\n',
    });

    const parsed = parseServiceAccountInput(`'${rawJson}'`);
    assert.ok(parsed);
    assert.equal(parsed.projectId, 'xacheus-ai');
    assert.equal(parsed.clientEmail, 'svc@xacheus-ai.iam.gserviceaccount.com');
    assert.ok(parsed.privateKey?.includes('\nFAKEKEY\n'));

    const b64 = Buffer.from(rawJson, 'utf8').toString('base64');
    assert.equal(parseServiceAccountInput(b64)?.projectId, 'xacheus-ai');

    const wrongProject = JSON.stringify({
      project_id: 'some-other-project',
      client_email: 'svc@some-other-project.iam.gserviceaccount.com',
      private_key: 'secret-private-key-do-not-echo',
    });
    assert.throws(
      () => parseServiceAccountInput(wrongProject),
      (err: unknown) => {
        assert.ok(err instanceof AdminNotConfiguredError);
        assert.match(err.message, /some-other-project/);
        assert.ok(!err.message.includes('secret-private-key-do-not-echo'));
        return true;
      },
    );
  } finally {
    if (prevProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = prevProject;
  }
});

test('getAdminDb uses REST transport end-to-end for agent creation queries and writes', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    req.resume();
    req.on('end', () => {
      if (req.url?.includes(':runAggregationQuery')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              result: { aggregateFields: { aggregate_0: { integerValue: '0' } } },
              readTime: new Date().toISOString(),
            },
          ]),
        );
        return;
      }
      if (req.url?.includes(':batchGet')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              missing: 'projects/xacheus-ai/databases/(default)/documents/users/user-1',
              readTime: new Date().toISOString(),
            },
          ]),
        );
        return;
      }
      if (req.url?.includes(':commit')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            writeResults: [{ updateTime: new Date().toISOString() }],
            commitTime: new Date().toISOString(),
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };

  const prevEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  const prevKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const prevProject = process.env.FIREBASE_PROJECT_ID;

  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${address.port}`;
  process.env.FIREBASE_PROJECT_ID = 'xacheus-ai';
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
    type: 'service_account',
    project_id: 'xacheus-ai',
    client_email: 'test@xacheus-ai.iam.gserviceaccount.com',
    private_key: privateKey,
  });

  try {
    const db = getAdminDb();
    const userSnap = await db.collection('users').doc('user-1').get();
    assert.equal(userSnap.exists, false);

    const countSnap = await db.collection('users').doc('user-1').collection('agents').count().get();
    assert.equal(countSnap.data().count, 0);

    await db.collection('users').doc('user-1').collection('agents').doc('agent-1').set({
      name: 'Front desk',
      optionalIgnored: undefined,
    });

    assert.ok(requests.some((r) => r.includes(':batchGet')));
    assert.ok(requests.some((r) => r.includes(':runAggregationQuery')));
    assert.ok(requests.some((r) => r.includes(':commit')));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prevEmulator === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = prevEmulator;
    if (prevKey === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    else process.env.FIREBASE_SERVICE_ACCOUNT_KEY = prevKey;
    if (prevProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = prevProject;
  }
});
