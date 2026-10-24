import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

// The client reads configuration at import time, so set the key first and load
// the module dynamically.
process.env.GROQ_API_KEY = 'test-key-not-real';
process.env.GROQ_TEXT_MODEL = 'openai/gpt-oss-120b';
process.env.GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo';
process.env.GROQ_BASE_URL = 'https://groq.test/openai/v1';

// Loaded lazily: tsx runs this file as CJS, where top-level await is not allowed.
const loadModules = (() => {
  let cached: Promise<{ client: typeof import('../src/lib/groq/client'); ApiError: typeof import('../src/lib/api/errors').ApiError }> | null = null;
  return () =>
    (cached ??= Promise.all([import('../src/lib/groq/client'), import('../src/lib/api/errors')]).then(
      ([clientModule, errorsModule]) => ({ client: clientModule, ApiError: errorsModule.ApiError }),
    ));
})();

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: Response, capture?: (url: string, init?: RequestInit) => void) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capture?.(String(input), init);
    return response;
  }) as typeof fetch;
}

test('transcription posts multipart audio to the configured Whisper endpoint', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  mockFetch(
    new Response(JSON.stringify({ text: '  Hello there. ', language: 'en', duration: 4.5 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    (url, init) => {
      capturedUrl = url;
      capturedInit = init;
    },
  );

  const { client } = await loadModules();
  const result = await client.transcribeAudio({
    data: new TextEncoder().encode('fake-audio').buffer as ArrayBuffer,
    mimeType: 'audio/webm',
    filename: 'clip.webm',
    language: 'en-US',
  });

  assert.equal(capturedUrl, 'https://groq.test/openai/v1/audio/transcriptions');
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, 'Bearer test-key-not-real');
  const body = capturedInit?.body as FormData;
  assert.equal(body.get('model'), 'whisper-large-v3-turbo');
  assert.equal(body.get('response_format'), 'verbose_json');
  assert.equal(body.get('language'), 'en');

  assert.equal(result.text, 'Hello there.');
  assert.equal(result.durationSeconds, 4.5);
  assert.equal(result.language, 'en');
});

test('transcription maps a 401 to a configuration error without leaking the key', async () => {
  mockFetch(new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 }));
  const { client, ApiError } = await loadModules();

  await assert.rejects(
    () =>
      client.transcribeAudio({
        data: new ArrayBuffer(8),
        mimeType: 'audio/webm',
        filename: 'clip.webm',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 503);
      assert.equal(error.code, 'provider_not_configured');
      assert.ok(!JSON.stringify(error).includes('test-key-not-real'));
      return true;
    },
  );
});

test('transcription maps 429 to a rate-limit error with retry guidance', async () => {
  mockFetch(
    new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), {
      status: 429,
      headers: { 'retry-after': '12' },
    }),
  );
  const { client, ApiError } = await loadModules();

  await assert.rejects(
    () => client.transcribeAudio({ data: new ArrayBuffer(8), mimeType: 'audio/webm', filename: 'clip.webm' }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 429);
      assert.equal(error.code, 'rate_limited');
      return true;
    },
  );
});

test('transcription rejects empty provider responses safely', async () => {
  mockFetch(new Response(JSON.stringify({ text: '' }), { status: 200 }));
  const { client } = await loadModules();
  const result = await client.transcribeAudio({ data: new ArrayBuffer(8), mimeType: 'audio/webm', filename: 'x.webm' });
  assert.equal(result.text, '');
});

test('chat completion sends model, messages and parses usage', async () => {
  let payload: Record<string, unknown> = {};
  mockFetch(
    new Response(
      JSON.stringify({
        model: 'openai/gpt-oss-120b',
        choices: [{ message: { content: ' We open at 9am. ' } }],
        usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
      }),
      { status: 200 },
    ),
    (_url, init) => {
      payload = JSON.parse(String(init?.body));
    },
  );

  const { client } = await loadModules();
  const result = await client.generateChatCompletion({
    messages: [
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'when do you open?' },
    ],
  });

  assert.equal(payload.model, 'openai/gpt-oss-120b');
  assert.equal(payload.stream, false);
  assert.equal((payload.messages as unknown[]).length, 2);
  assert.equal(result.content, 'We open at 9am.');
  assert.equal(result.totalTokens, 150);
  assert.equal(result.promptTokens, 120);
});

test('chat completion treats an empty completion as a provider error', async () => {
  mockFetch(new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }));
  const { client, ApiError } = await loadModules();
  await assert.rejects(
    () => client.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
    (error: unknown) => error instanceof ApiError && error.code === 'provider_error',
  );
});

test('timeouts produce an actionable error rather than hanging', async () => {
  globalThis.fetch = (async () => {
    const error = new Error('timed out');
    error.name = 'TimeoutError';
    throw error;
  }) as typeof fetch;
  const { client, ApiError } = await loadModules();

  await assert.rejects(
    () => client.generateChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
    (error: unknown) => error instanceof ApiError && /too long/i.test(error.message),
  );
});

test('model listing tolerates provider failures', async () => {
  mockFetch(new Response('nope', { status: 500 }));
  const { client } = await loadModules();
  assert.deepEqual(await client.listAvailableModels(), []);
});
