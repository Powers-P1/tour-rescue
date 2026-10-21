import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createQlooClient, QLOO_ORIGIN } from '../src/qloo/client.ts';
import type { QlooCache, QlooClientOptions } from '../src/qloo/client.ts';
import { loadCityCells } from '../src/qloo/geo.ts';
import { fixture } from './helpers/scenarios.ts';

const SECRET = 'server-secret-never-exported';
const ARTIST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const REGION = 'POLYGON((5 47,16 47,16 56,5 56,5 47))';
function examples() { return fixture('qloo/contract_examples_synthetic.json') as { heatmap: unknown; search: unknown }; }
class MemoryCache implements QlooCache {
  values = new Map<string, unknown>();
  async get(key: string) { return structuredClone(this.values.get(key)); }
  async put(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
}
function setup(overrides: Partial<QlooClientOptions> = {}) {
  let time = Date.parse('2026-10-21T10:00:00.000Z');
  let calls = 0;
  let reservations = 0;
  const cache = new MemoryCache();
  const mapping = loadCityCells({ metadata: { precision: 5 }, cities: [
    { cityId: 'city-a', name: 'A', cells: ['u1x0e', 'u1x0s'] }, { cityId: 'city-b', name: 'B', cells: ['u33dc'] },
  ], index: { u1x0e: 'city-a', u1x0s: 'city-a', u33dc: 'city-b' } });
  const options: QlooClientOptions = { apiKey: SECRET, now: () => time, cache,
    beforeRequest: async () => { reservations++; }, mapping,
    candidateSet: { id: 'two-cities', cityIds: ['city-a', 'city-b'] }, regionWkt: REGION,
    fetch: async input => { calls++; return Response.json(String(input).includes('/search?') ? examples().search : examples().heatmap); },
    ...overrides };
  return { options, cache, client: createQlooClient(options), calls: () => calls, reservations: () => reservations,
    advance: (ms: number) => { time += ms; } };
}
const heatmap = (queryId = 'heatmap-q1', artistId = ARTIST) => ({ queryId, artistId, role: 'target' as const, weight: 1 });

test('heatmap transport uses the exact GET contract and normalizes mean affinity before core percentiles', async () => {
  let seenUrl = '';
  let seenInit: RequestInit | undefined;
  const s = setup({ fetch: async (input, init) => { seenUrl = String(input); seenInit = init; return Response.json(examples().heatmap); } });
  const result = await s.client.heatmap(heatmap());
  assert.equal(result.status, 'success');
  const url = new URL(seenUrl);
  assert.equal(url.origin, QLOO_ORIGIN);
  assert.equal(url.pathname, '/v2/insights');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    'filter.location': REGION, 'filter.type': 'urn:heatmap', 'output.heatmap.boundary': 'urn:geohash',
    'signal.interests.entities': ARTIST,
  });
  assert.equal(seenInit!.method, 'GET');
  assert.equal(seenInit!.redirect, 'error');
  assert.equal(new Headers(seenInit!.headers).get('X-Api-Key'), SECRET);
  assert.equal(s.reservations(), 1);
  assert.ok(!JSON.stringify(result).includes(SECRET));
  assert.ok(!JSON.stringify(result).includes('Invented provider-warning text'));
  if (result.status === 'success') {
    assert.equal(result.value.observations[0]!.affinity.status, 'known');
    assert.equal(result.value.provenance.kind, 'recording-reference');
    assert.equal(result.evidence.warnings[0]!.code, 'QLOO_UPSTREAM_WARNING');
    assert.equal(result.evidence.responseRecordedAt.status, 'known');
  }
});

test('cache hits skip HTTP and quota, retain original acquisition time and use the current query identity', async () => {
  const s = setup();
  const first = await s.client.heatmap(heatmap());
  s.advance(1000);
  const second = await createQlooClient(s.options).heatmap({ ...heatmap('heatmap-q2'), role: 'comparison', weight: 0.25 });
  assert.equal(s.calls(), 1); assert.equal(s.reservations(), 1);
  assert.equal(second.evidence.source, 'cache');
  assert.equal(second.evidence.startedAt, '2026-10-21T10:00:01.000Z');
  assert.deepEqual(second.evidence.responseRecordedAt, first.evidence.responseRecordedAt);
  assert.deepEqual(second.evidence.responseReference, first.evidence.responseReference);
  assert.ok(second.evidence.warnings.every(w => w.queryId === 'heatmap-q2'));
  if (second.status === 'success') { assert.equal(second.value.role, 'comparison'); assert.equal(second.value.weight, 0.25); }
  const stored = JSON.stringify([...s.cache.values.values()]);
  assert.ok(!stored.includes(SECRET)); assert.ok(!stored.includes('affinity_rank')); assert.ok(!stored.includes('Invented provider-warning text'));
});

test('cache expires, rejects malformed entries and does not mix different artist queries', async () => {
  const s = setup({ cacheTtlMs: 1000 });
  await s.client.heatmap(heatmap());
  s.advance(1001);
  await s.client.heatmap(heatmap('q-expired'));
  assert.equal(s.calls(), 2);
  await s.client.heatmap(heatmap('q-other-artist', SECOND));
  assert.equal(s.calls(), 3);
  for (const key of s.cache.values.keys()) s.cache.values.set(key, { schemaVersion: 'wrong' });
  const retry = await s.client.heatmap(heatmap('q-invalid-cache'));
  assert.equal(s.calls(), 4);
  assert.ok(retry.evidence.warnings.some(w => w.code === 'QLOO_CACHE_MISS'));
});

test('durable quota denial is fail-closed, consumes no HTTP and never repeats untrusted exception text', async () => {
  const s = setup({ beforeRequest: async () => { throw Object.assign(new Error(SECRET), { code: 'QLOO_MONTHLY_LIMIT', retryAfterSeconds: 3600 }); } });
  const result = await s.client.heatmap(heatmap());
  assert.equal(result.status, 'error'); assert.equal(s.calls(), 0);
  if (result.status === 'error') { assert.equal(result.error.code, 'QLOO_MONTHLY_LIMIT'); assert.equal(result.error.retryAfterSeconds, 3600); }
  assert.equal(result.evidence.httpStatus.status, 'unknown');
  assert.equal(result.evidence.responseReference.status, 'unknown');
  assert.ok(!JSON.stringify(result).includes(SECRET));
  const missingLedger = setup({ beforeRequest: async () => { throw new Error(SECRET); } });
  const unavailable = await missingLedger.client.heatmap(heatmap());
  assert.equal(unavailable.status === 'error' && unavailable.error.code, 'QLOO_QUOTA_UNAVAILABLE');
  assert.equal(missingLedger.calls(), 0);
});

test('HTTP failures preserve safe status and retry metadata without response bodies, secrets or automatic retries', async () => {
  for (const [status, code] of [[429, 'QLOO_RATE_LIMIT'], [401, 'QLOO_AUTH'], [403, 'QLOO_AUTH'], [500, 'QLOO_HTTP_ERROR']] as const) {
    let calls = 0;
    const s = setup({ fetch: async () => { calls++; return new Response(SECRET, { status, headers: { 'Retry-After': '12' } }); } });
    const result = await s.client.heatmap(heatmap());
    assert.equal(result.status === 'error' && result.error.code, code);
    assert.equal(calls, 1);
    assert.deepEqual(result.evidence.httpStatus, { status: 'known', value: status });
    assert.ok(!JSON.stringify(result).includes(SECRET));
    assert.equal(s.cache.values.size, 0);
    if (status === 429 && result.status === 'error') assert.equal(result.error.retryAfterSeconds, 12);
  }
});

test('both announced and streamed oversize payloads are cancelled before parsing or caching', async () => {
  for (const announce of [false, true]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(120)); }, cancel() { cancelled = true; } });
    const s = setup({ maxResponseBytes: 100, fetch: async () => new Response(stream, {
      headers: { 'Content-Type': 'application/json', ...(announce ? { 'Content-Length': '120' } : {}) },
    }) });
    const result = await s.client.heatmap(heatmap());
    assert.equal(result.status === 'error' && result.error.code, 'QLOO_RESPONSE_TOO_LARGE');
    assert.equal(cancelled, true); assert.equal(s.cache.values.size, 0);
  }
});

test('deadline aborts the upstream request and returns a bounded safe failure', async () => {
  let aborted = false;
  const s = setup({ timeoutMs: 10, fetch: async (_input, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => { aborted = true; reject(new Error(SECRET)); }, { once: true });
  }) });
  const result = await s.client.heatmap(heatmap());
  assert.equal(result.status === 'error' && result.error.code, 'QLOO_TIMEOUT');
  assert.equal(aborted, true); assert.ok(!JSON.stringify(result).includes(SECRET));
});

test('invalid JSON, HTML and malformed successful envelopes fail without exporting untrusted content', async () => {
  for (const response of [new Response(`{${SECRET}`, { headers: { 'Content-Type': 'application/json' } }),
    new Response(`<html>${SECRET}</html>`, { headers: { 'Content-Type': 'text/html' } }),
    Response.json({ success: false, error: SECRET })]) {
    const s = setup({ fetch: async () => response });
    const result = await s.client.heatmap(heatmap());
    assert.equal(result.status === 'error' && result.error.code, 'QLOO_CONTRACT_ERROR');
    assert.ok(!JSON.stringify(result).includes(SECRET));
  }
});

test('cache infrastructure errors add safe warnings without losing an otherwise valid fresh profile', async () => {
  const s = setup({ cache: { get: async () => { throw new Error(SECRET); }, put: async () => { throw new Error(SECRET); } } });
  const result = await s.client.heatmap(heatmap());
  assert.equal(result.status, 'success');
  assert.ok(result.evidence.warnings.some(w => w.code === 'QLOO_CACHE_READ_FAILED'));
  assert.ok(result.evidence.warnings.some(w => w.code === 'QLOO_CACHE_WRITE_FAILED'));
  assert.ok(!JSON.stringify(result).includes(SECRET));
});

test('artist search is bounded, cached and returns only identities with no silent first-match selection', async () => {
  const s = setup();
  const result = await s.client.searchArtists({ queryId: 'search-q1', query: 'Fictional Tides' });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.evidence.parameters, { query: 'Fictional Tides', types: 'urn:entity:artist', take: '10' });
  if (result.status === 'success') assert.deepEqual(result.value, [{ id: ARTIST, name: 'The Fictional Tides' }]);
  await s.client.searchArtists({ queryId: 'search-q2', query: 'Fictional Tides' });
  assert.equal(s.calls(), 1); assert.equal(s.reservations(), 1);
  assert.ok(!JSON.stringify(result).includes('properties'));
});

test('secret reflection is rejected in both live and cached search projections', async () => {
  const s = setup({ fetch: async () => Response.json({ results: [{ entity_id: ARTIST, name: SECRET, subtype: 'urn:entity:artist' }] }) });
  const live = await s.client.searchArtists({ queryId: 'q-secret', query: 'Artist' });
  assert.equal(live.status === 'error' && live.error.code, 'QLOO_CONTRACT_ERROR');
  assert.ok(!JSON.stringify(live).includes(SECRET));
  const cached = setup();
  await cached.client.searchArtists({ queryId: 'q-first', query: 'Artist' });
  const [key, value] = [...cached.cache.values][0]!;
  cached.cache.values.set(key, { ...(value as object), data: [{ id: ARTIST, name: SECRET }] });
  const repaired = await cached.client.searchArtists({ queryId: 'q-second', query: 'Artist' });
  assert.equal(cached.calls(), 2); assert.equal(repaired.status, 'success');
  assert.ok(!JSON.stringify(repaired).includes(SECRET));
});

test('secret reflection detection also handles characters escaped by JSON serialization', async () => {
  const secret = 'server-"secret\\-never-exported';
  const s = setup({ apiKey: secret, fetch: async () => Response.json({ results: [
    { entity_id: ARTIST, name: `reflected ${secret}`, subtype: 'urn:entity:artist' },
  ] }) });
  const result = await s.client.searchArtists({ queryId: 'q-escaped-secret', query: 'Artist' });
  assert.equal(result.status === 'error' && result.error.code, 'QLOO_CONTRACT_ERROR');
  assert.ok(!JSON.stringify(result).includes(JSON.stringify(secret).slice(1, -1)));
  assert.equal(s.cache.values.size, 0);
});

test('constructor/request bounds reject world regions, combined artists and malformed preferences before network I/O', async () => {
  const s = setup();
  for (const regionWkt of ['POLYGON((-180 -90,180 -90,180 90,-180 90,-180 -90))', 'Berlin', 'POLYGON((5 47,16 56,16 47,5 56,5 47))']) {
    assert.throws(() => createQlooClient({ ...s.options, regionWkt }), RangeError);
  }
  assert.throws(() => createQlooClient({ ...s.options, maxResponseBytes: 1_000_001 }), RangeError);
  assert.throws(() => createQlooClient({ ...s.options, apiKey: '' }), RangeError);
  await assert.rejects(() => s.client.heatmap(heatmap('q-combined', `${ARTIST},${SECOND}`)), RangeError);
  await assert.rejects(() => s.client.searchArtists({ queryId: 'q-bad', query: SECRET }), RangeError);
  assert.equal(s.calls(), 0); assert.equal(s.reservations(), 0);
});
