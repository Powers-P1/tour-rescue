import assert from 'node:assert/strict';
import test from 'node:test';
import { RateDenied, UsageLedger } from '../worker/src/ledger.ts';
import { ledgerOptions } from '../worker/src/config.ts';
import type { WorkerEnv } from '../worker/src/config.ts';
import { MemoryLedgerStorage } from './helpers/ledger-storage.ts';

const start = Date.parse('2026-10-21T12:00:00Z');
const client = (id: number) => id.toString(16).padStart(64, '0');

test('AI sessions use an independent atomic daily budget and survive object recreation', async () => {
  const storage = new MemoryLedgerStorage();
  const options = { now: () => start, dailyAiSessions: 3, dailyAiPerClientSessions: 2 };
  const ledger = new UsageLedger(storage, options);
  const sameClient = await Promise.allSettled(Array.from({ length: 8 }, () => ledger.reserveAiSession(client(1))));
  assert.equal(sameClient.filter(row => row.status === 'fulfilled').length, 2);
  assert.ok(sameClient.filter(row => row.status === 'rejected').every(row => row.status === 'rejected'
    && row.reason instanceof RateDenied && row.reason.code === 'AI_CLIENT_DAILY_LIMIT'));
  const recreated = new UsageLedger(storage, options);
  const others = await Promise.allSettled([recreated.reserveAiSession(client(2)), recreated.reserveAiSession(client(3))]);
  assert.equal(others.filter(row => row.status === 'fulfilled').length, 1);
  await assert.rejects(recreated.reserveAiSession(client(4)), (error: unknown) => error instanceof RateDenied
    && error.code === 'AI_DAILY_LIMIT' && error.retryAfterSeconds === 43_200);
  // An AI cap does not spend the existing Qloo live-action or upstream budget.
  await recreated.reserveSession(client(1));
  await recreated.acquireQlooRequest();
  const qloo = storage.data.get('tour-rescue:quotas:v1') as { sessions: number; qlooRequests: number };
  assert.equal(qloo.sessions, 1);
  assert.equal(qloo.qlooRequests, 1);
});

test('AI daily rotation does not reopen an allowance on clock rollback and storage failure fails closed', async () => {
  let now = start;
  const storage = new MemoryLedgerStorage();
  const ledger = new UsageLedger(storage, { now: () => now, dailyAiSessions: 1, dailyAiPerClientSessions: 1 });
  storage.failNextWrite = true;
  await assert.rejects(ledger.reserveAiSession(client(1)), /storage write failure/);
  assert.equal(storage.data.size, 0);
  await ledger.reserveAiSession(client(1));
  now -= 86_400_000;
  await assert.rejects(ledger.reserveAiSession(client(2)), (error: unknown) => error instanceof RateDenied && error.code === 'AI_DAILY_LIMIT');
  now = start + 86_400_000;
  await ledger.reserveAiSession(client(2));
  assert.ok(!JSON.stringify([...storage.data]).includes(client(1)));
});

test('AI quota configuration accepts only bounded positive integers and hashes', async () => {
  const storage = new MemoryLedgerStorage();
  for (const options of [{ dailyAiSessions: 31 }, { dailyAiSessions: 0 }, { dailyAiPerClientSessions: 11 }, { dailyAiPerClientSessions: 1.5 }]) {
    assert.throws(() => new UsageLedger(storage, options), RangeError);
  }
  const env: WorkerEnv = { UNIT_LEDGER: { idFromName: name => name, get: () => ({ fetch }) } };
  assert.equal(ledgerOptions(env, () => start).dailyAiSessions, 10);
  assert.equal(ledgerOptions(env, () => start).dailyAiPerClientSessions, 3);
  assert.throws(() => ledgerOptions({ ...env, DAILY_AI_LIMIT: '31' }, () => start), RangeError);
  await assert.rejects(new UsageLedger(storage).reserveAiSession('198.51.100.1'), /never a raw address/);
  await storage.put('tour-rescue:ai-quotas:v1', { version: 1, sessions: 0 });
  await assert.rejects(new UsageLedger(storage).reserveAiSession(client(1)), /Stored quota state is invalid/);
});
