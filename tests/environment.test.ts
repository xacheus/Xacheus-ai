import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.resolve(__dirname, '..');

function isolatedEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(GROQ_|TWILIO_|FIREBASE_SERVICE_ACCOUNT_|TELEPHONY_|GOOGLE_APPLICATION_CREDENTIALS$|NODE_OPTIONS$)/.test(key)) {
      delete env[key];
    }
  }
  return { ...env, ...overrides };
}

function evaluate(script: string, overrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--conditions=react-server', '--import', 'tsx', '--eval', script],
    { cwd: root, env: isolatedEnv(overrides), encoding: 'utf8', timeout: 30_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('missing server secrets do not prevent imports and report unconfigured providers', () => {
  const status = JSON.parse(evaluate(`
    const { providerStatus } = require('./src/lib/env.ts');
    console.log(JSON.stringify(providerStatus()));
  `));
  assert.equal(status.groq.configured, false);
  assert.equal(status.groq.textModel, 'openai/gpt-oss-120b');
  assert.equal(status.groq.whisperModel, 'whisper-large-v3-turbo');
  assert.equal(status.telephony.callingEnabled, false);
});

test('server configuration reads environment overrides without exposing secret values', () => {
  const secret = 'gsk_test_only_never_a_real_provider_key_9Zq7';
  const output = evaluate(`
    const { providerStatus, serverEnv } = require('./src/lib/env.ts');
    if (serverEnv.groqApiKey !== process.env.GROQ_API_KEY) process.exit(1);
    console.log(JSON.stringify(providerStatus()));
  `, { GROQ_API_KEY: secret, GROQ_TEXT_MODEL: 'test-chat-model' });
  const status = JSON.parse(output);
  assert.equal(status.groq.configured, true);
  assert.equal(status.groq.textModel, 'test-chat-model');
  assert.ok(!output.includes(secret));
  assert.ok(!output.includes('groqApiKey'));
});

test('public status and health responses contain no server credentials', () => {
  const secret = 'gsk_test_only_not_a_real_key_for_endpoint_test';
  const serviceAccount = JSON.stringify({ private_key: 'test-only-private-key-sentinel' });
  const output = evaluate(`
    (async () => {
      const status = require('./src/app/api/status/route.ts');
      const health = require('./src/app/api/health/route.ts');
      console.log(JSON.stringify({
        status: await (await status.GET()).json(),
        health: await (await health.GET()).json(),
      }));
    })().catch(() => process.exit(1));
  `, { GROQ_API_KEY: secret, FIREBASE_SERVICE_ACCOUNT_KEY: serviceAccount });
  const response = JSON.parse(output);
  assert.equal(response.status.providers.groq.configured, true);
  assert.equal(response.health.checks.groq, 'configured');
  assert.ok(!output.includes(secret));
  assert.ok(!output.includes('test-only-private-key-sentinel'));
});

test('the server-only boundary rejects imports without the React server condition', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--eval', "require('./src/lib/env.ts')"],
    { cwd: root, env: isolatedEnv(), encoding: 'utf8', timeout: 30_000 },
  );
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot be imported from a Client Component/);
});

test('the configuration doctor never prints even partial Groq keys', () => {
  const secret = 'gsk_test_only_never_a_real_provider_key_9Zq7';
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    cwd: root,
    env: isolatedEnv({ GROQ_API_KEY: secret }),
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.match(result.stdout, /present \(value hidden\)/);
  assert.ok(!result.stdout.includes(secret));
  assert.ok(!result.stdout.includes('9Zq7'));
});

test('invalid service-account JSON is reported without echoing its contents', () => {
  const secret = '{"private_key":"test-only-secret-DO-NOT-PRINT" invalid JSON';
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    cwd: root,
    env: isolatedEnv({ FIREBASE_SERVICE_ACCOUNT_KEY: secret }),
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /could not parse service-account configuration \(value hidden\)/);
  assert.ok(!result.stdout.includes('DO-NOT-PRINT'));
  assert.ok(!result.stdout.includes('private_key'));
});

test('Vercel uses Next.js, reproducible builds and Node 24 without inline secrets', () => {
  const config = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(config.framework, 'nextjs');
  assert.equal(config.installCommand, 'npm ci');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(pkg.engines.node, '24.x');
  assert.equal(config.env, undefined);
  assert.equal(config.build?.env, undefined);
});

test('Git ignores deployment environment files and service-account directories but not the example', () => {
  const files = ['.env', '.env.local', '.env.production', '.env.preview', '.env.development', 'secrets/account.json'];
  const ignored = spawnSync('git', ['check-ignore', '--no-index', ...files], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(ignored.status, 0, ignored.stderr);
  assert.deepEqual(ignored.stdout.trim().split('\n'), files);
  const example = spawnSync('git', ['check-ignore', '--no-index', '.env.example'], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(example.status, 1, 'The public configuration template must stay trackable.');
});
