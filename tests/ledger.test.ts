import assert from 'node:assert/strict';
import test from 'node:test';
import { RateDenied, UsageLedger } from '../worker/src/ledger.ts';
import type { LedgerOptions, RateDeniedCode } from '../worker/src/ledger.ts';
import { MemoryLedgerStorage as MemoryStorage } from './helpers/ledger-storage.ts';

const hash = (id: number) => id.toString(16).padStart(64, '0');
const start = Date.parse('2026-10-21T12:00:00Z');
function fixture(options: LedgerOptions = {}) {
  const storage = new MemoryStorage();
  let now = start;
  return { storage, ledger: new UsageLedger(storage, { now: () => now, ...options }),
    setNow: (value: number) => { now = value; } };
}
function denied(code: RateDeniedCode, retry?: number): (value: unknown) => boolean {
  return value => value instanceof RateDenied && value.code === code
    && value.retryAfterSeconds >= 1 && (retry === undefined || value.retryAfterSeconds === retry);
}

test('concurrent provider attempts share one durable rolling allowance of ten', async () => {
  const { ledger, storage } = fixture();
  const outcomes = await Promise.allSettled(Array.from({ length: 15 }, () => ledger.acquireQlooRequest()));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 10);
  for (const result of outcomes.filter(result => result.status === 'rejected')) {
    assert.ok(result.status === 'rejected' && denied('QLOO_RATE_LIMIT', 1)(result.reason));
  }
  const recreated = new UsageLedger(storage, { now: () => start });
  await assert.rejects(recreated.acquireQlooRequest(), denied('QLOO_RATE_LIMIT', 1));
});

test('rolling rate boundary is exactly one second, including across calendar seconds', async () => {
  const { ledger, setNow } = fixture({ requestsPerSecond: 2 });
  setNow(start + 900);
  await ledger.acquireQlooRequest(); await ledger.acquireQlooRequest();
  setNow(start + 1899);
  await assert.rejects(ledger.acquireQlooRequest(), denied('QLOO_RATE_LIMIT', 1));
  setNow(start + 1900);
  await ledger.acquireQlooRequest(); await ledger.acquireQlooRequest();
  await assert.rejects(ledger.acquireQlooRequest(), denied('QLOO_RATE_LIMIT', 1));
});

test('monthly reservation counts failed upstream attempts and resets only at the UTC month', async () => {
  const { ledger, setNow } = fixture({ monthlyQlooRequests: 2 });
  setNow(Date.parse('2026-10-31T23:59:58Z'));
  await ledger.acquireQlooRequest(); // The caller may now fail or time out; no refund exists.
  await ledger.acquireQlooRequest();
  await assert.rejects(ledger.acquireQlooRequest(), denied('QLOO_MONTHLY_LIMIT', 2));
  setNow(Date.parse('2026-10-31T23:59:59.999Z'));
  await assert.rejects(ledger.acquireQlooRequest(), denied('QLOO_MONTHLY_LIMIT', 1));
  setNow(Date.parse('2026-11-01T00:00:00Z'));
  await ledger.acquireQlooRequest(); await ledger.acquireQlooRequest();
  await assert.rejects(ledger.acquireQlooRequest(), denied('QLOO_MONTHLY_LIMIT'));
});

test('daily global and client allowances are atomic and old client identities expire at UTC midnight', async () => {
  const { ledger, storage, setNow } = fixture({ dailyLiveRequests: 3, dailyPerClientRequests: 2 });
  await ledger.reserveSession(hash(1)); await ledger.reserveSession(hash(1));
  await assert.rejects(ledger.reserveSession(hash(1)), denied('LIVE_CLIENT_DAILY_LIMIT', 43200));
  await ledger.reserveSession(hash(2));
  await assert.rejects(ledger.reserveSession(hash(3)), denied('LIVE_DAILY_LIMIT', 43200));
  setNow(Date.parse('2026-10-22T00:00:00Z'));
  await ledger.reserveSession(hash(3));
  const saved = JSON.stringify([...storage.data]);
  assert.ok(!saved.includes(hash(1)) && !saved.includes(hash(2)));
  assert.ok(saved.includes(hash(3)));
});

test('simultaneous sessions cannot overspend either a client or the service allowance', async () => {
  const { ledger } = fixture({ dailyLiveRequests: 3, dailyPerClientRequests: 2 });
  const same = await Promise.allSettled(Array.from({ length: 10 }, () => ledger.reserveSession(hash(1))));
  assert.equal(same.filter(result => result.status === 'fulfilled').length, 2);
  const others = await Promise.allSettled([ledger.reserveSession(hash(2)), ledger.reserveSession(hash(3))]);
  assert.equal(others.filter(result => result.status === 'fulfilled').length, 1);
});

test('backwards clocks do not reopen an old quota period or release rolling requests', async () => {
  const { ledger, setNow } = fixture({ monthlyQlooRequests: 1, dailyPerClientRequests: 1 });
  await ledger.acquireQlooRequest(); await ledger.reserveSession(hash(1));
  setNow(Date.parse('2026-09-01T00:00:00Z'));
  await assert.rejects(ledger.acquireQlooRequest(), denied('QLOO_MONTHLY_LIMIT'));
  await assert.rejects(ledger.reserveSession(hash(1)), denied('LIVE_CLIENT_DAILY_LIMIT'));
  const rate = fixture({ requestsPerSecond: 1 });
  await rate.ledger.acquireQlooRequest();
  rate.setNow(start - 5000);
  await assert.rejects(rate.ledger.acquireQlooRequest(), denied('QLOO_RATE_LIMIT'));
});

test('storage failure prevents a reservation and rolls back without an in-memory fallback', async () => {
  const { ledger, storage } = fixture({ monthlyQlooRequests: 1 });
  storage.failNextWrite = true;
  await assert.rejects(ledger.acquireQlooRequest(), /storage write failure/);
  assert.equal(storage.data.size, 0);
  await ledger.acquireQlooRequest();
  await assert.rejects(ledger.acquireQlooRequest(), denied('QLOO_MONTHLY_LIMIT'));
});

test('hard caps, raw addresses, invalid clocks and corrupt persisted quota fail closed', async () => {
  const storage = new MemoryStorage();
  for (const options of [
    { requestsPerSecond: 11 }, { monthlyQlooRequests: 50001 }, { dailyLiveRequests: 1001 },
    { dailyPerClientRequests: 101 }, { cacheMaxEntries: 129 }, { cacheTtlMs: 86400001 },
    { requestsPerSecond: 0 }, { requestsPerSecond: Number.NaN }, { cacheMaxEntryBytes: 1.5 },
  ]) assert.throws(() => new UsageLedger(storage, options), RangeError);
  const { ledger } = fixture();
  await assert.rejects(ledger.reserveSession('192.0.2.1'), /never a raw address/);
  await assert.rejects(ledger.reserveSession('A'.repeat(64)), /SHA-256/);
  await assert.rejects(new UsageLedger(storage, { now: () => Number.NaN }).acquireQlooRequest(), /clock/);
  await storage.put('tour-rescue:quotas:v1', { version: 1, sessions: 0 });
  await assert.rejects(new UsageLedger(storage).acquireQlooRequest(), /Stored quota state is invalid/);
});

test('private cache hits preserve JSON and original TTL without consuming provider or session quotas', async () => {
  const { ledger, storage, setNow } = fixture({ monthlyQlooRequests: 1, dailyLiveRequests: 1, cacheTtlMs: 1000 });
  const value = { recordedAt: '2026-10-21T12:00:00Z', cities: [{ id: 'example', value: 0 }], missing: null };
  await ledger.cachePut('heatmap:a', value);
  value.cities[0]!.value = 99;
  const first = await ledger.cacheGet<typeof value>('heatmap:a');
  assert.equal(first?.cities[0]?.value, 0);
  first!.cities[0]!.value = 100;
  setNow(start + 999);
  assert.equal((await ledger.cacheGet<typeof value>('heatmap:a'))?.cities[0]?.value, 0);
  assert.equal(storage.data.has('tour-rescue:quotas:v1'), false);
  await ledger.acquireQlooRequest(); await ledger.reserveSession(hash(1));
  setNow(start + 1000);
  assert.equal(await ledger.cacheGet('heatmap:a'), undefined);
  assert.ok(!JSON.stringify([...storage.data]).includes('heatmap:a'));
});

test('cache retention is bounded, oldest writes are evicted deterministically and expired entries are removed', async () => {
  const { ledger, storage, setNow } = fixture({ cacheMaxEntries: 2, cacheTtlMs: 100 });
  await ledger.cachePut('b', { value: 2 }); await ledger.cachePut('a', { value: 1 });
  await ledger.cachePut('c', { value: 3 });
  assert.equal(await ledger.cacheGet('a'), undefined, 'equal write times evict the alphabetically first key');
  assert.deepEqual(await ledger.cacheGet('b'), { value: 2 });
  assert.deepEqual(await ledger.cacheGet('c'), { value: 3 });
  assert.equal(storage.data.size, 3, 'one index and exactly two entries');
  setNow(start + 100);
  await ledger.cachePut('d', { value: 4 });
  assert.equal(storage.data.size, 2);
  assert.equal(await ledger.cacheGet('b'), undefined);
  assert.equal(await ledger.cacheGet('c'), undefined);
});

test('oversized cache values are skipped and malformed JSON is never silently coerced', async () => {
  const { ledger, storage } = fixture({ cacheMaxEntryBytes: 16 });
  await ledger.cachePut('large', { value: 'too long to fit' });
  assert.equal(storage.data.size, 0);
  await ledger.cachePut('small', 'éé'); // UTF-8 size, not UTF-16 string length.
  assert.equal(await ledger.cacheGet('small'), 'éé');
  for (const value of [undefined, Number.NaN, Infinity, { a: undefined }, new Date(), [undefined]]) {
    await assert.rejects(ledger.cachePut('invalid', value), TypeError);
  }
  const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
  await assert.rejects(ledger.cachePut('invalid', cyclic), TypeError);
  await assert.rejects(ledger.cachePut('bad\nkey', {}), TypeError);
});

test('cache overwrite has one entry, TTL restarts explicitly and clock regression cannot revive an expired entry', async () => {
  const { ledger, storage, setNow } = fixture({ cacheTtlMs: 100 });
  await ledger.cachePut('a', 1);
  setNow(start + 50);
  await ledger.cachePut('a', 2);
  setNow(start + 149);
  assert.equal(await ledger.cacheGet('a'), 2);
  assert.equal(storage.data.size, 2);
  setNow(start + 150);
  assert.equal(await ledger.cacheGet('a'), undefined);
  setNow(start);
  assert.equal(await ledger.cacheGet('a'), undefined);
});

test('cache writes roll back atomically and corrupt cached payloads become misses', async () => {
  const { ledger, storage } = fixture();
  storage.failNextWrite = true;
  await assert.rejects(ledger.cachePut('a', { ok: true }), /storage write failure/);
  assert.equal(storage.data.size, 0);
  await ledger.cachePut('a', { ok: true });
  const key = 'tour-rescue:cache:v1:a';
  const old = await storage.get<{ version: 1; expiresAt: number; payload: string }>(key);
  await storage.put(key, { ...old, payload: '{bad json' });
  assert.equal(await ledger.cacheGet('a'), undefined);
  assert.equal(storage.data.has(key), false);
});

test('default judging caps (150 global, 25 per client) are reachable and persisted state above the old 30/10 caps stays valid', async () => {
  const { ledger } = fixture({ dailyLiveRequests: 150, dailyPerClientRequests: 25 });
  for (let i = 0; i < 25; i++) await ledger.reserveSession(hash(1));
  await assert.rejects(ledger.reserveSession(hash(1)), denied('LIVE_CLIENT_DAILY_LIMIT'));
  for (let i = 2; i < 7; i++) for (let j = 0; j < 25; j++) await ledger.reserveSession(hash(i));
  await assert.rejects(ledger.reserveSession(hash(7)), denied('LIVE_DAILY_LIMIT'));
  await ledger.acquireQlooRequest();
});
