import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_MODEL, AI_PROVIDER_LIMITS, ANTHROPIC_MESSAGES_URL, AiProviderError, createAnthropicClient } from '../worker/src/ai-provider.ts';

const payload = (overrides: Record<string, unknown> = {}) => ({ id: 'message-test', model: AI_MODEL,
  type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 20 }, ...overrides });
const request = { system: 'System', messages: [{ role: 'user' as const, content: 'Task' }], tools: [], maxTokens: 200 };
const transport = (handler: (url: string, init: RequestInit) => Promise<Response> | Response): typeof fetch =>
  (async (url, init) => handler(String(url), init ?? {})) as typeof fetch;

test('Anthropic adapter uses exact model and stable auto-tool between_tools contract; secrets stay in headers', async () => {
  const client = createAnthropicClient({ apiKey: 'private-test-key', fetch: transport((url, init) => {
    assert.equal(url, ANTHROPIC_MESSAGES_URL);
    assert.equal(init.redirect, 'manual');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('x-api-key'), 'private-test-key');
    assert.equal(headers.get('anthropic-version'), '2023-06-01');
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'claude-sonnet-5-5');
    assert.deepEqual(body.thinking, { type: 'between_tools' });
    assert.deepEqual(body.tool_choice, { type: 'auto' });
    assert.equal(body.output_config.effort, 'medium');
    assert.equal(String(init.body).includes('private-test-key'), false);
    return Response.json(payload());
  }) });
  assert.equal((await client.message(request)).usage.outputTokens, 20);
});

test('Anthropic usage includes cache reads/writes and native web requests', async () => {
  const client = createAnthropicClient({ apiKey: 'key', fetch: transport(() => Response.json(payload({ usage: {
    input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 50, output_tokens: 30,
    server_tool_use: { web_search_requests: 1, web_fetch_requests: 1 },
  } }))) });
  assert.deepEqual((await client.message(request)).usage, { inputTokens: 170, outputTokens: 30, searchRequests: 1, fetchRequests: 1 });
});

test('provider redirects, auth and unavailable-model failures are safe and never follow redirects or switch models', async () => {
  for (const [status, code] of [[301, 'AI_PROVIDER_UNAVAILABLE'], [302, 'AI_PROVIDER_UNAVAILABLE'], [307, 'AI_PROVIDER_UNAVAILABLE'], [401, 'AI_AUTH_UNAVAILABLE'], [403, 'AI_AUTH_UNAVAILABLE'], [404, 'AI_MODEL_UNAVAILABLE'], [500, 'AI_PROVIDER_UNAVAILABLE']] as const) {
    let calls = 0;
    const client = createAnthropicClient({ apiKey: 'secret-never-print', fetch: transport((url, init) => {
      assert.equal(url, ANTHROPIC_MESSAGES_URL); assert.equal(init.redirect, 'manual');
      calls += 1; return new Response('Provider echoes secret-never-print and arbitrary instructions', { status, headers: { Location: 'https://untrusted.example/redirect' } });
    }) });
    await assert.rejects(client.message(request), error => {
      assert.ok(error instanceof AiProviderError); assert.equal(error.code, code);
      assert.equal(error.message.includes('secret-never-print'), false); return true;
    });
    assert.equal(calls, 1);
  }
});

test('provider rate-limit retry is bounded and no retry spends another request', async () => {
  let calls = 0;
  const client = createAnthropicClient({ apiKey: 'key', fetch: transport(() => {
    calls += 1; return new Response('secret message', { status: 429, headers: { 'Retry-After': '9999999' } });
  }) });
  await assert.rejects(client.message(request), error => error instanceof AiProviderError && error.code === 'AI_RATE_LIMIT' && error.retryAfterSeconds === 3600);
  assert.equal(calls, 1);
});

test('invalid model, usage, token overrun and malformed JSON never become successful replies', async () => {
  const variants = [payload({ model: 'another-model' }), payload({ usage: { input_tokens: -1, output_tokens: 0 } }),
    payload({ usage: { input_tokens: 10, output_tokens: 201 } }), payload({ stop_reason: 'invented' })];
  for (const value of variants) {
    const client = createAnthropicClient({ apiKey: 'key', fetch: transport(() => Response.json(value)) });
    await assert.rejects(client.message(request), error => error instanceof AiProviderError && error.code === 'AI_INVALID_RESPONSE');
  }
  const malformed = createAnthropicClient({ apiKey: 'key', fetch: transport(() => new Response('{secret', { status: 200 })) });
  await assert.rejects(malformed.message(request), error => error instanceof AiProviderError && !error.message.includes('{secret'));
});

test('body bounds apply even without Content-Length; oversized requests never leave the Worker', async () => {
  let calls = 0;
  const client = createAnthropicClient({ apiKey: 'key', fetch: transport(() => { calls += 1; return new Response('x'.repeat(AI_PROVIDER_LIMITS.maxResponseBytes + 1)); }) });
  await assert.rejects(client.message({ ...request, system: 'x'.repeat(AI_PROVIDER_LIMITS.maxRequestBytes) }), error => error instanceof AiProviderError && error.code === 'AI_CONTEXT_LIMIT');
  assert.equal(calls, 0);
  await assert.rejects(client.message(request), error => error instanceof AiProviderError && error.code === 'AI_INVALID_RESPONSE');
  assert.equal(calls, 1);
});

test('aborted sessions and request deadlines abort transport without exposing its error', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const client = createAnthropicClient({ apiKey: 'key', timeoutMs: 20, fetch: transport((_url, init) => {
    calls += 1;
    return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('secret transport details')), { once: true }));
  }) });
  await assert.rejects(client.message({ ...request, signal: controller.signal }), error => error instanceof AiProviderError && error.code === 'AI_CANCELLED');
  assert.equal(calls, 0);
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(client.message(request), error => error instanceof AiProviderError && error.code === 'AI_TIMEOUT'); }
  finally { clearTimeout(keepAlive); }
  assert.equal(calls, 1);
});
