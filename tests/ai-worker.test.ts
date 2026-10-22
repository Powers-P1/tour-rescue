import assert from 'node:assert/strict';
import test from 'node:test';
import geometry from '../fixtures/geo/city_cells_de.json' with { type: 'json' };
import type { AiSessionResult, AiStreamEvent } from '../src/ai/types.ts';
import { createUnitHandler } from '../worker/src/app.ts';
import type { ApiDecisionResult } from '../worker/src/app.ts';
import type { runAiSession, RunAiSessionOptions } from '../worker/src/ai-agent.ts';
import { ledgerOptions } from '../worker/src/config.ts';
import type { WorkerEnv } from '../worker/src/config.ts';
import { UsageLedger } from '../worker/src/ledger.ts';
import { handleWorkerRequest } from '../worker/src/router.ts';
import { MemoryLedgerStorage } from './helpers/ledger-storage.ts';

const ORIGIN = 'https://tour-rescue.pages.dev';
const API = 'https://worker.example';
const KEY = 'test-anthropic-key-not-for-export';
const QLOO_KEY = 'test-qloo-key-not-for-export';
const NOW = Date.parse('2026-10-21T12:00:00Z');
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];

function post(path: string, body: unknown, ip = '198.51.100.40', signal?: AbortSignal): Request {
  return new Request(`${API}${path}`, { method: 'POST', headers: {
    Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip,
    'X-Tour-Client': 'f'.repeat(64), // The edge must discard client-supplied identity headers.
  }, body: JSON.stringify(body), ...(signal === undefined ? {} : { signal }) });
}

function emptyResult(options: RunAiSessionOptions): AiSessionResult {
  return { schemaVersion: 'tour-rescue.ai-session.v1', sessionId: options.sessionId, mode: 'live',
    scenarioId: options.baseResult.scenarioId, model: 'claude-sonnet-5-5',
    startedAt: new Date(NOW).toISOString(), completedAt: new Date(NOW).toISOString(),
    baseResult: options.baseResult, steps: [], sources: [], proposals: [],
    usage: { inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 0, webSearchCalls: 0, webFetchCalls: 0 },
    stopReason: 'incomplete', warnings: ['Synthetic runner used by the Worker integration test.'] };
}

function setup(patch: Partial<WorkerEnv> = {}, runner?: typeof runAiSession) {
  const storage = new MemoryLedgerStorage();
  let now = NOW;
  let serial = 0;
  let providerCalls = 0;
  let unit: (request: Request) => Promise<Response>;
  const calls: RunAiSessionOptions[] = [];
  const env: WorkerEnv = {
    UNIT_LEDGER: { idFromName: name => name, get: () => ({ fetch: request => unit(request) }) },
    QLOO_API_KEY: QLOO_KEY, ANTHROPIC_API_KEY: KEY, LIVE_ENABLED: 'true', AI_ENABLED: 'true',
    ALLOWED_ORIGIN: ORIGIN, ...patch,
  };
  const ledger = new UsageLedger(storage, ledgerOptions(env, () => now));
  unit = createUnitHandler({ env, ledger, now: () => now, runId: () => `ai-worker-${++serial}`,
    fetch: async input => {
      providerCalls += 1;
      if (new URL(String(input)).pathname === '/search') return Response.json({ results: ids.map((id, index) => ({
        entity_id: id, name: `Synthetic artist ${index + 1}`, type: 'urn:entity:artist',
      })) });
      return Response.json({ success: true, results: { heatmap: geometry.cities.map((city, index) => ({
        location: { geohash: Object.entries(geometry.index).find(([, owner]) => owner === city.cityId)![0] },
        query: { affinity: (index + 1) / 100, popularity: 0.5 },
      })) } });
    },
    runAi: async options => { calls.push(options); return runner ? runner(options) : emptyResult(options); },
  });
  return { storage, ledger, calls, providerCalls: () => providerCalls, env,
    advance: (ms: number) => { now += ms; },
    send: (request: Request) => handleWorkerRequest(request, env, () => now),
  };
}

async function live(s: ReturnType<typeof setup>): Promise<ApiDecisionResult> {
  const response = await s.send(post('/api/live', { targetArtistId: ids[0], comparisonArtistIds: [], controlArtistId: ids[1] }));
  assert.equal(response.status, 200, await response.clone().text());
  return response.json() as Promise<ApiDecisionResult>;
}

async function events(response: Response): Promise<AiStreamEvent[]> {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /application\/x-ndjson/);
  assert.match(response.headers.get('Cache-Control') ?? '', /no-store/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const text = await response.text();
  assert.ok(!text.includes(KEY) && !text.includes(QLOO_KEY) && !text.includes('198.51.100.40'));
  return text.trim().split('\n').map(line => JSON.parse(line) as AiStreamEvent);
}

test('live AI uses private normalized context and bounded user preferences, without new Qloo calls', async () => {
  const s = setup();
  assert.equal((await s.send(post('/api/live/search', { query: 'Synthetic artist' }))).status, 200);
  const base = await live(s);
  assert.ok(base.audit.queries.every(query => query.status === 'success'));
  assert.equal(base.audit.replay.fitInput.status, 'known');
  const before = s.providerCalls();
  const policy = { ...base.audit.replay.policy, minimumFitIndex: 30, maxAdditionalDistanceMetres: 450000 };
  const rows = await events(await s.send(post('/api/ai/live', { baseRunId: base.audit.runId, policy, additionalBudgetMinorUnits: 60000 })));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.type, 'result');
  assert.equal(s.calls.length, 1);
  const input = s.calls[0]!;
  assert.deepEqual(input.baseResult.audit.replay.policy, policy);
  assert.deepEqual(input.baseResult.audit.replay.scenario.tour.constraints.additionalBudget,
    { status: 'known', value: { currency: 'EUR', minorUnits: 60000 } });
  assert.deepEqual(input.baseResult.audit.replay.scenario.tour.shows, base.audit.replay.scenario.tour.shows);
  assert.equal(input.baseResult.artists.target.name, 'Synthetic artist 1');
  assert.equal(input.baseResult.artists.control.name, 'Synthetic artist 2');
  assert.equal(input.apiKey, KEY);
  assert.equal(s.providerCalls(), before);
  const qloo = s.storage.data.get('tour-rescue:quotas:v1') as { sessions: number; qlooRequests: number };
  const ai = s.storage.data.get('tour-rescue:ai-quotas:v1') as { sessions: number };
  assert.equal(qloo.sessions, 2); assert.equal(qloo.qlooRequests, 3); assert.equal(ai.sessions, 1);
  const privateCache = [...s.storage.data.entries()].find(([key]) => key.endsWith(`ai-base:${base.audit.runId}`));
  assert.ok(privateCache, 'Rank-only replay must fit the private cache without serializing every audit analysis.');
  assert.ok(!JSON.stringify(privateCache).includes('"analysis"'));
});

test('base identity, expiration and input validation reject before reserving AI spend', async () => {
  const s = setup();
  const base = await live(s);
  for (const body of [
    { baseRunId: base.audit.runId, audit: base.audit },
    { baseRunId: base.audit.runId, model: 'other' },
    { baseRunId: base.audit.runId, additionalBudgetMinorUnits: 150001 },
    { baseRunId: base.audit.runId, policy: { ...base.audit.replay.policy, maxAdditionalDistanceMetres: 500001 } },
    { baseRunId: '../private' },
  ]) assert.equal((await s.send(post('/api/ai/live', body))).status, JSON.stringify(body).length > 16384 ? 413 : 400);
  const stolen = await s.send(post('/api/ai/live', { baseRunId: base.audit.runId }, '198.51.100.41'));
  assert.equal(stolen.status, 409);
  assert.equal(((await stolen.json()) as { error: { code: string } }).error.code, 'AI_BASE_EXPIRED');
  assert.equal((await s.send(post('/api/ai/live', { baseRunId: 'unknown-run' }))).status, 409);
  s.advance(6 * 60 * 60 * 1000);
  assert.equal((await s.send(post('/api/ai/live', { baseRunId: base.audit.runId }))).status, 409);
  assert.equal(s.storage.data.has('tour-rescue:ai-quotas:v1'), false);
  assert.equal(s.calls.length, 0);
});

test('tour knowledge and procedure reach only this research request and never enter shared cache',async()=>{
 const s=setup(),base=await live(s);
 const knowledge={schemaVersion:'tour-rescue.knowledge.v1',workspaceId:'workspace-alpha',documents:[{id:'rider',title:'Private rider',text:'ALPHA_ONLY_PIANO needs a piano.',updatedAt:new Date(NOW).toISOString()}]};
 for(const extra of [{knowledge:{...knowledge,documents:Array(9).fill(knowledge.documents[0])}},{skill:'book-and-pay'}])assert.equal((await s.send(post('/api/ai/live',{baseRunId:base.audit.runId,...extra}))).status,400);
 assert.equal(s.calls.length,0);assert.equal(s.storage.data.has('tour-rescue:ai-quotas:v1'),false);
 await events(await s.send(post('/api/ai/live',{baseRunId:base.audit.runId,knowledge,skill:'evidence-gaps'})));
 assert.deepEqual(s.calls[0]?.knowledge,knowledge);assert.equal(s.calls[0]?.skill,'evidence-gaps');
 await events(await s.send(post('/api/ai/live',{baseRunId:base.audit.runId})));
 assert.equal(s.calls[1]?.knowledge,undefined);assert.equal(JSON.stringify([...s.storage.data.entries()]).includes('ALPHA_ONLY_PIANO'),false);
});

test('AI kill switch, missing secret and untrusted origins never start the runner', async () => {
  for (const patch of [{ AI_ENABLED: 'false' }, { ANTHROPIC_API_KEY: '' }, { LIVE_ENABLED: 'false' }]) {
    const s = setup(patch);
    const health = await s.send(new Request(`${API}/health`));
    assert.equal(((await health.json()) as { aiEnabled: boolean }).aiEnabled, false);
    assert.equal((await s.send(post('/api/ai/live', { baseRunId: 'none' }))).status, 503);
    assert.equal(s.storage.data.size, 0);
    assert.equal(s.calls.length, 0);
  }
  const s = setup();
  const untrusted = post('/api/ai/live', { baseRunId: 'none' });
  untrusted.headers.set('Origin', 'https://untrusted.example');
  assert.equal((await s.send(untrusted)).status, 403);
  assert.equal(s.calls.length, 0);
});

test('provider failure consumes one reserved session, returns a safe stream error and respects daily cap', async () => {
  const s = setup({ AI_DAILY_CAP: '1' }, async () => { throw new Error(`Provider leaked ${KEY}`); });
  const base = await live(s);
  const rows = await events(await s.send(post('/api/ai/live', { baseRunId: base.audit.runId })));
  assert.deepEqual(rows, [{ type: 'error', error: { code: 'AI_SERVICE_UNAVAILABLE',
    message: 'The AI session could not be completed. No new option was accepted.' } }]);
  const denied = await s.send(post('/api/ai/live', { baseRunId: base.audit.runId }));
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('Retry-After'), '43200');
  assert.equal(s.calls.length, 1);
});

test('stream cancellation aborts in-flight work and does not refund a paid session', async () => {
  let observedAbort: Promise<void> | undefined;
  const s = setup({}, async options => {
    observedAbort = new Promise<void>(resolve => options.signal!.addEventListener('abort', () => resolve(), { once: true }));
    options.onEvent?.({ type: 'step', step: { sequence: 1, at: new Date(NOW).toISOString(), type: 'status', message: 'Research started.' } });
    await observedAbort;
    return { ...emptyResult(options), stopReason: 'cancelled' };
  });
  const base = await live(s);
  const response = await s.send(post('/api/ai/live', { baseRunId: base.audit.runId }));
  const reader = response.body!.getReader();
  assert.equal((await reader.read()).done, false);
  await reader.cancel();
  await observedAbort;
  assert.equal((s.storage.data.get('tour-rescue:ai-quotas:v1') as { sessions: number }).sessions, 1);
});

test('a disconnect during the quota transaction spends the reservation but starts no provider work', async () => {
  const s = setup();
  const base = await live(s);
  const controller = new AbortController();
  const reserve = s.ledger.reserveAiSession.bind(s.ledger);
  s.ledger.reserveAiSession = async hash => { await reserve(hash); controller.abort(); };
  const response = await s.send(post('/api/ai/live', { baseRunId: base.audit.runId }, '198.51.100.40', controller.signal));
  assert.equal(response.status, 499);
  assert.equal(s.calls.length, 0);
  assert.equal((s.storage.data.get('tour-rescue:ai-quotas:v1') as { sessions: number }).sessions, 1);
});

test('/health exposes AI caps and today\'s recorded tokens and estimated cost; the input stop is passed to the runner', async () => {
  const s = setup({ AI_MAX_INPUT_TOKENS: '120000' }, async options => ({ ...emptyResult(options),
    usage: { inputTokens: 50_000, outputTokens: 1_000, modelCalls: 2, toolCalls: 3, webSearchCalls: 1, webFetchCalls: 0, estimatedCostUsd: 0.12 } }));
  const base = await live(s);
  const health = async () => (await (await s.send(new Request(`${API}/health`))).json()) as
    { caps: { aiDaily: number; aiPerClientDaily: number }; aiToday: { reservedSessions: number; recordedSessions: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number } };
  const before = await health();
  assert.equal(before.caps.aiDaily, 40); assert.equal(before.caps.aiPerClientDaily, 5);
  assert.equal(before.aiToday.estimatedCostUsd, 0);
  await events(await s.send(post('/api/ai/live', { baseRunId: base.audit.runId })));
  assert.equal(s.calls[0]!.maxInputTokens, 120000);
  const after = await health();
  assert.deepEqual([after.aiToday.reservedSessions, after.aiToday.recordedSessions, after.aiToday.inputTokens, after.aiToday.outputTokens, after.aiToday.estimatedCostUsd],
    [1, 1, 50000, 1000, 0.12]);
});
