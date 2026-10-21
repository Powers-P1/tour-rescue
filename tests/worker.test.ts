import assert from 'node:assert/strict';
import test from 'node:test';
import geometry from '../fixtures/geo/city_cells_de.json' with { type: 'json' };
import { replayDecisionAudit } from '../src/core/audit.ts';
import { createUnitHandler } from '../worker/src/app.ts';
import type { ApiDecisionResult } from '../worker/src/app.ts';
import { ledgerOptions } from '../worker/src/config.ts';
import type { WorkerEnv } from '../worker/src/config.ts';
import { UnitLedger } from '../worker/src/index.ts';
import { UsageLedger } from '../worker/src/ledger.ts';
import { handleWorkerRequest, LEDGER_NAME } from '../worker/src/router.ts';
import { MemoryLedgerStorage } from './helpers/ledger-storage.ts';

const ORIGIN = 'https://tour-rescue.pages.dev';
const API = 'https://tour-rescue-worker.example';
const SECRET = 'worker-integration-secret-never-public';
const IP = '198.51.100.42';
const START = Date.parse('2026-10-21T12:00:00Z');
const TARGET = 'aaaaaaaa-1111-4111-8111-111111111111';
const COMPARISONS = ['bbbbbbbb-2222-4222-8222-222222222222',
  'cccccccc-3333-4333-8333-333333333333', 'dddddddd-4444-4444-8444-444444444444'];
const CONTROL = 'eeeeeeee-5555-4555-8555-555555555555';
const RAW_AFFINITY = 0.123456789012345;
const RAW_POPULARITY = 0.43210987654321;

// These are invented affinities and UUIDs. The geometry is the public, Qloo-free mapping.
const cells = geometry.cities.map(city => {
  const entry = Object.entries(geometry.index).find(([_cell, owner]) => owner === city.cityId);
  assert.ok(entry, `The frozen geometry must cover ${city.cityId}.`);
  return { cityId: city.cityId, geohash: entry[0] };
});

function liveBody() {
  return { scenarioId: 'germany-five-dates-v1', targetArtistId: TARGET,
    comparisonArtistIds: [...COMPARISONS], controlArtistId: CONTROL,
    policy: { schemaVersion: 'tour-rescue.decision-policy.v1', minimumFitIndex: 20,
      maxAdditionalDistanceMetres: 400000 } };
}

function heatmap(artistId: string, missingCity?: string) {
  return { success: true, warnings: [`Unrestricted provider text ${SECRET} ${IP}`], results: {
    heatmap: cells.filter(cell => cell.cityId !== missingCity).map((cell, index) => {
      let affinity = 0.5; // Comparisons intentionally tie; their retained weight stays explicit.
      if (artistId === TARGET.toUpperCase()) affinity = cell.cityId === 'de-nuremberg' ? 0.99
        : cell.cityId === 'de-frankfurt' ? RAW_AFFINITY : 0.3 + index / 100;
      if (artistId === CONTROL.toUpperCase()) affinity = cell.cityId === 'de-frankfurt' ? 0.99
        : cell.cityId === 'de-nuremberg' ? RAW_AFFINITY : 0.3 + index / 100;
      return { location: { geohash: cell.geohash }, query: { affinity, popularity: RAW_POPULARITY },
        privateProviderField: SECRET };
    }),
  } };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${API}${path}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': IP, ...headers,
  }, body: JSON.stringify(body) });
}

interface TestOptions {
  readonly env?: Partial<Omit<WorkerEnv, 'UNIT_LEDGER'>>;
  readonly provider?: typeof fetch;
}

function setup(options: TestOptions = {}) {
  let time = START;
  let run = 0;
  const storage = new MemoryLedgerStorage();
  const requests: { url: URL; headers: Headers }[] = [];
  const forwarded: Request[] = [];
  const objectNames: string[] = [];
  let unit: (request: Request) => Promise<Response>;
  const env: WorkerEnv = {
    QLOO_API_KEY: SECRET, LIVE_ENABLED: 'true', ALLOWED_ORIGIN: ORIGIN, ...options.env,
    UNIT_LEDGER: {
      idFromName(name) { objectNames.push(name); return name; },
      get() { return { fetch: async request => { forwarded.push(request.clone()); return unit(request); } }; },
    },
  };
  const ledger = new UsageLedger(storage, ledgerOptions(env, () => time));
  const provider: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, headers: new Headers(init?.headers) });
    if (options.provider !== undefined) return options.provider(input, init);
    if (url.pathname === '/search') return Response.json({ results: [
      { entity_id: TARGET, name: 'Fictional Harbour Lights', subtype: 'urn:entity:artist', secret: SECRET },
      { entity_id: CONTROL, name: 'Fictional Control Act', subtype: 'urn:entity:artist' },
    ] });
    return Response.json(heatmap(url.searchParams.get('signal.interests.entities')!));
  };
  unit = createUnitHandler({ env, ledger, fetch: provider, now: () => time,
    runId: () => `worker-test-run-${++run}`, probeStorage: async () => { await storage.get('health-probe'); } });
  return { env, ledger, storage, requests, forwarded, objectNames,
    advance: (milliseconds: number) => { time += milliseconds; },
    send: (request: Request) => handleWorkerRequest(request, env, () => time),
  };
}

function assertPrivateEvidenceExcluded(serialized: string): void {
  for (const privateValue of [SECRET, IP, String(RAW_AFFINITY), String(RAW_POPULARITY),
    'Unrestricted provider text', 'privateProviderField', 'X-Api-Key', '"geohash"', '"popularity"',
    ...cells.map(cell => `"${cell.geohash}"`)]) {
    assert.ok(!serialized.includes(privateValue), `Public output must exclude ${privateValue}.`);
  }
}

function quota(storage: MemoryLedgerStorage) {
  return storage.data.get('tour-rescue:quotas:v1') as {
    sessions: number; qlooRequests: number; clients: { hash: string; count: number }[];
  } | undefined;
}

async function decision(response: Response): Promise<ApiDecisionResult> {
  const serialized = await response.text();
  assert.equal(response.status, 200, serialized);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assertPrivateEvidenceExcluded(serialized);
  return JSON.parse(serialized) as ApiDecisionResult;
}

test('public demo and audit download work without a secret, provider call or quota reservation', async () => {
  const s = setup({ env: { QLOO_API_KEY: '', LIVE_ENABLED: 'false' },
    provider: async () => { assert.fail('Demo must not call Qloo.'); } });
  const response = await s.send(new Request(`${API}/api/demo`, { headers: { Origin: ORIGIN } }));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const result = await decision(response);
  assert.equal(result.mode, 'demo');
  assert.equal(result.audit.mode, 'demo');
  assert.equal(result.audit.scenarioDataKind, 'synthetic');
  assert.ok(result.audit.queries.every(query => query.source === 'synthetic' && query.httpStatus.status === 'unknown'));
  assert.equal(result.audit.zeroViolationsGate.status, 'PASS');
  const download = await s.send(new Request(`${API}/api/demo/audit`));
  assert.equal(download.status, 200);
  assert.match(download.headers.get('Content-Disposition')!, /^attachment; filename="tour-rescue-demo-audit\.json"$/);
  assert.deepEqual(await download.json(), result.audit);
  assert.deepEqual(replayDecisionAudit(result.audit), result.audit);
  assert.equal(s.requests.length, 0);
  assert.equal(s.storage.data.size, 0);
  assert.ok(s.objectNames.every(name => name === LEDGER_NAME));
});

test('live flow maps 24 cities, audits a changed control decision and runs three omissions without extra Qloo calls', async () => {
  const s = setup();
  const result = await decision(await s.send(post('/api/live', liveBody(), { 'X-Tour-Client': '0'.repeat(64) })));
  const audit = result.audit;
  assert.equal(result.mode, 'live');
  assert.equal(audit.mode, 'live');
  assert.equal(audit.frozenCandidateSet.status, 'known');
  if (audit.frozenCandidateSet.status !== 'known') assert.fail();
  assert.equal(audit.frozenCandidateSet.value.cityIds.length, 24);
  assert.equal(audit.queries.length, 5);
  assert.ok(audit.queries.every(query => query.source === 'live' && query.status === 'success'));
  assert.equal(audit.analysis.decision.recommendation.status, 'recommended');
  if (audit.analysis.decision.recommendation.status !== 'recommended') assert.fail();
  assert.equal(audit.analysis.decision.recommendation.optionId, 'replacement-nuremberg');
  assert.equal(audit.controlRun.status, 'known');
  if (audit.controlRun.status !== 'known') assert.fail();
  assert.equal(audit.controlRun.value.decision.recommendation.status, 'recommended');
  if (audit.controlRun.value.decision.recommendation.status !== 'recommended') assert.fail();
  assert.equal(audit.controlRun.value.decision.recommendation.optionId, 'detour-frankfurt');
  assert.deepEqual(audit.controlRun.value.recommendedOptionChanged, { status: 'known', value: true });
  assert.equal(audit.analysis.artistSensitivity.runs.length, 3);
  assert.ok(audit.analysis.artistSensitivity.runs.every(run => run.removed.artistId !== TARGET.toUpperCase()
    && run.fitReport.candidateSet.cityIds.length === 24));
  assert.equal(audit.analysis.breakpoints.axes.length, 3);
  assert.equal(audit.zeroViolationsGate.status, 'PASS');
  assert.deepEqual(audit.zeroViolationsGate.violatedCheckCount, { status: 'known', value: 0 });
  for (const option of audit.stopChanges.originalToOptions) {
    assert.equal(option.lockedCommitments.status, 'PASS');
    assert.deepEqual(option.unchangedLockedShowIds, ['show-1', 'show-2', 'show-4', 'show-5']);
  }
  assert.equal(audit.replay.fitInput.status, 'known');
  if (audit.replay.fitInput.status !== 'known') assert.fail();
  const profiles = audit.replay.fitInput.value.profiles;
  assert.equal(profiles.find(profile => profile.role === 'target')!.weight, 0.5);
  assert.ok(profiles.filter(profile => profile.role === 'comparison').every(profile => profile.weight === 0.5 / 3));
  assert.equal(result.artists.target.id, TARGET.toUpperCase());
  assert.equal(result.artists.target.id, profiles.find(profile => profile.role === 'target')!.artistId);
  assert.deepEqual(result.artists.comparisons.map(artist => artist.id).sort(),
    profiles.filter(profile => profile.role === 'comparison').map(profile => profile.artistId).sort());
  assert.equal(audit.controlRun.value.targetArtistId, CONTROL.toUpperCase());
  assert.deepEqual(replayDecisionAudit(audit), audit);
  assert.equal(s.requests.length, 5); // Control, breakpoints and omissions never trigger hidden extra queries.
  for (const request of s.requests) {
    assert.equal(request.url.origin, 'https://hackathon.api.qloo.com');
    assert.equal(request.url.pathname, '/v2/insights');
    assert.equal(request.url.searchParams.get('output.heatmap.boundary'), 'urn:geohash');
    assert.equal(request.url.searchParams.has('take'), false);
    assert.equal(request.headers.get('X-Api-Key'), SECRET);
  }
  assert.equal(quota(s.storage)?.qlooRequests, 5);
  assert.equal(quota(s.storage)?.sessions, 1);
  const forwarded = s.forwarded[0]!;
  assert.equal(forwarded.headers.has('CF-Connecting-IP'), false);
  assert.equal(forwarded.headers.has('X-Api-Key'), false);
  assert.match(forwarded.headers.get('X-Tour-Client')!, /^[a-f0-9]{64}$/);
  assert.notEqual(forwarded.headers.get('X-Tour-Client'), '0'.repeat(64));
  const persisted = JSON.stringify([...s.storage.data]);
  assert.ok(!persisted.includes(IP) && !persisted.includes(SECRET));
});

test('repeated live sessions use private cache without provider quota but still enforce the daily client cap', async () => {
  const s = setup({ env: { LIVE_DAILY_CAP: '3', LIVE_IP_CAP: '2' } });
  const first = await decision(await s.send(post('/api/live', liveBody())));
  s.advance(1000);
  const second = await decision(await s.send(post('/api/live', liveBody())));
  assert.notEqual(first.audit.runId, second.audit.runId);
  assert.ok(second.audit.queries.every(query => query.source === 'cache'));
  assert.deepEqual(second.audit.queries.map(query => query.responseRecordedAt), first.audit.queries.map(query => query.responseRecordedAt));
  assert.equal(s.requests.length, 5);
  assert.equal(quota(s.storage)?.qlooRequests, 5);
  assert.equal(quota(s.storage)?.sessions, 2);
  const denied = await s.send(post('/api/live', liveBody()));
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get('Retry-After')) > 0);
  assert.equal(((await denied.json()) as { error: { code: string } }).error.code, 'LIVE_CLIENT_DAILY_LIMIT');
  assert.equal(s.requests.length, 5);
  assert.equal(quota(s.storage)?.sessions, 2);
});

test('a sparse live heatmap keeps all frozen cities and UNKNOWN evidence rather than substituting demo scores', async () => {
  const missingCity = 'de-nuremberg';
  const s = setup({ provider: async input => {
    const artist = new URL(String(input)).searchParams.get('signal.interests.entities')!;
    return Response.json(heatmap(artist, artist === TARGET.toUpperCase() ? missingCity : undefined));
  } });
  const result = await decision(await s.send(post('/api/live', liveBody())));
  const audit = result.audit;
  assert.equal(audit.analysis.decision.recommendation.status, 'needs-evidence');
  assert.equal(audit.zeroViolationsGate.status, 'UNKNOWN');
  assert.equal(audit.frozenCandidateSet.status, 'known');
  if (audit.frozenCandidateSet.status !== 'known') assert.fail();
  assert.equal(audit.frozenCandidateSet.value.cityIds.length, 24);
  assert.ok(audit.frozenCandidateSet.value.cityIds.includes(missingCity));
  assert.ok(audit.queries.every(query => query.source === 'live' && query.status === 'success'));
  assert.ok(audit.warnings.some(warning => warning.code === 'MISSING_CITY_AFFINITY'));
  assert.equal(audit.replay.fitInput.status, 'known');
  if (audit.replay.fitInput.status !== 'known') assert.fail();
  const target = audit.replay.fitInput.value.profiles.find(profile => profile.role === 'target')!;
  assert.equal(target.provenance.kind, 'recording-reference');
  assert.equal(target.observations.length, 24);
  assert.equal(target.observations.find(row => row.cityId === missingCity)!.affinity.status, 'unknown');
  assert.deepEqual(replayDecisionAudit(audit), audit);
  assert.equal(s.requests.length, 5);
});

test('failed baseline or control acquisition yields an honest audit with no raw errors or synthetic Qloo fallback', async () => {
  for (const failingArtist of [TARGET, CONTROL]) {
    const s = setup({ provider: async input => {
      const artist = new URL(String(input)).searchParams.get('signal.interests.entities')!;
      return artist === failingArtist.toUpperCase()
        ? new Response(`Unrestricted provider text ${SECRET} ${IP}`, { status: 503 })
        : Response.json(heatmap(artist));
    } });
    const result = await decision(await s.send(post('/api/live', liveBody())));
    const audit = result.audit;
    assert.equal(audit.frozenCandidateSet.status, 'known');
    if (audit.frozenCandidateSet.status !== 'known') assert.fail();
    assert.equal(audit.frozenCandidateSet.value.cityIds.length, 24);
    assert.equal(audit.queries.filter(query => query.status === 'failed').length, 1);
    assert.ok(audit.queries.every(query => query.source === 'live'));
    assert.deepEqual(audit.queries.find(query => query.status === 'failed')!.httpStatus, { status: 'known', value: 503 });
    assert.equal(audit.controlRun.status, 'unknown');
    if (failingArtist === TARGET) {
      assert.equal(audit.analysis.decision.recommendation.status, 'needs-evidence');
      assert.equal(audit.zeroViolationsGate.status, 'UNKNOWN');
      assert.equal(audit.replay.fitInput.status, 'unknown');
      assert.equal(audit.analysis.artistSensitivity.status, 'unknown');
    } else {
      assert.equal(audit.analysis.decision.recommendation.status, 'recommended');
      assert.equal(audit.zeroViolationsGate.status, 'PASS');
      assert.equal(audit.analysis.artistSensitivity.runs.length, 3);
    }
    assert.deepEqual(replayDecisionAudit(audit), audit);
    assert.equal(s.requests.length, 5); // A failed attempt is counted and not retried.
    assert.equal(quota(s.storage)?.qlooRequests, 5);
  }
});

test('artist search exposes only resolved matches and safe query evidence, and repeated search uses cache', async () => {
  const s = setup();
  for (let iteration = 0; iteration < 2; iteration++) {
    const response = await s.send(post('/api/live/search', { query: 'Fictional Harbour' }));
    const text = await response.text();
    assert.equal(response.status, 200, text);
    assertPrivateEvidenceExcluded(text);
    const result = JSON.parse(text) as { artists: { id: string; name: string }[]; queries: { source: string }[] };
    assert.deepEqual(result.artists, [
      { id: TARGET.toUpperCase(), name: 'Fictional Harbour Lights' },
      { id: CONTROL.toUpperCase(), name: 'Fictional Control Act' },
    ]);
    assert.equal(result.queries[0]!.source, iteration === 0 ? 'live' : 'cache');
  }
  assert.equal(s.requests.length, 1);
  assert.equal(quota(s.storage)?.qlooRequests, 1);
  assert.equal(quota(s.storage)?.sessions, 2);
});

test('edge route, origin, method and client identity checks reject requests before forwarding or spending quota', async () => {
  const s = setup();
  const attempts: [Request, number, string][] = [
    [post('/api/live', liveBody(), { Origin: 'https://untrusted.example' }), 403, 'ORIGIN_NOT_ALLOWED'],
    [new Request(`${API}/api/live`), 405, 'METHOD_NOT_ALLOWED'],
    [post('/api/live?key=not-supported', liveBody()), 400, 'QUERY_NOT_ALLOWED'],
    [post('/not-an-api', liveBody()), 404, 'NOT_FOUND'],
    [new Request(`${API}/api/live`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(liveBody()) }), 503, 'CLIENT_ID_UNAVAILABLE'],
  ];
  for (const [request, status, code] of attempts) {
    const response = await s.send(request);
    assert.equal(response.status, status);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, code);
  }
  const preflight = await s.send(new Request(`${API}/api/live`, { method: 'OPTIONS', headers: { Origin: ORIGIN } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(s.forwarded.length, 0);
  assert.equal(s.requests.length, 0);
  assert.equal(s.storage.data.size, 0);
  const disabled = setup({ env: { LIVE_ENABLED: 'false' } });
  const response = await disabled.send(post('/api/live', liveBody()));
  assert.equal(response.status, 503);
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, 'LIVE_DISABLED');
  assert.equal(disabled.forwarded.length, 0);
});

test('malformed and out-of-scope inputs consume neither a live session nor a provider request', async () => {
  const s = setup();
  const invalid = [
    { ...liveBody(), targetArtistId: 'an unresolved artist name' },
    { ...liveBody(), controlArtistId: TARGET.toUpperCase() },
    { ...liveBody(), comparisonArtistIds: [...COMPARISONS, CONTROL] },
    { ...liveBody(), scenarioId: 'another-region' },
    { ...liveBody(), arbitraryQlooUrl: 'https://untrusted.example' },
    { ...liveBody(), additionalBudgetMinorUnits: 150001 },
    { ...liveBody(), policy: { ...liveBody().policy, maxAdditionalDistanceMetres: 500001 } },
    ['not an object'],
  ];
  for (const body of invalid) {
    const response = await s.send(post('/api/live', body));
    assert.equal(response.status, 400, await response.text());
  }
  const search = await s.send(post('/api/live/search', { query: 'x' }));
  assert.equal(search.status, 400);
  assert.equal(s.requests.length, 0);
  assert.equal(s.storage.data.size, 0);
});

test('body limits apply with or without Content-Length and invalid JSON/media types never reach the ledger', async () => {
  const s = setup();
  const oversized = post('/api/live', { filler: 'x'.repeat(17000) });
  assert.equal(oversized.headers.has('Content-Length'), false);
  const declared = post('/api/live', {}, { 'Content-Length': '99999' });
  for (const request of [oversized, declared]) {
    const response = await s.send(request);
    assert.equal(response.status, 413);
  }
  const malformed = new Request(`${API}/api/live`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'CF-Connecting-IP': IP,
  }, body: '{broken json' });
  assert.equal((await s.send(malformed)).status, 400);
  assert.equal((await s.send(post('/api/live', liveBody(), { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal(s.forwarded.length, 0);
  assert.equal(s.requests.length, 0);
  assert.equal(s.storage.data.size, 0);
});

test('the existing HTTP-only UnitLedger adapter is importable in Node and serves demo without Qloo configuration', async () => {
  const storage = new MemoryLedgerStorage();
  const env: WorkerEnv = { UNIT_LEDGER: {
    idFromName() { assert.fail('The DO must not recursively dispatch.'); },
    get() { assert.fail('The DO must not recursively dispatch.'); },
  } };
  const unit = new UnitLedger({ storage }, env);
  const health = await unit.fetch(new Request('https://unit-ledger.internal/health'));
  assert.equal(health.status, 200);
  assert.equal(((await health.json()) as { storage: string }).storage, 'available');
  const demo = await decision(await unit.fetch(new Request('https://unit-ledger.internal/demo')));
  assert.equal(demo.mode, 'demo');
  assert.equal(storage.data.size, 0);
});

test('a heatmap response above the 8 MB limit yields a failed query and UNKNOWN evidence, not a crash', async () => {
  const s = setup({ provider: async input => {
    const artist = new URL(String(input)).searchParams.get('signal.interests.entities')!;
    return artist === TARGET.toUpperCase()
      ? new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '9000000' } })
      : Response.json(heatmap(artist));
  } });
  const response = await s.send(post('/api/live', liveBody()));
  assert.equal(response.status, 200);
  const audit = (await decision(response)).audit;
  const failed = audit.queries.filter(query => query.status === 'failed');
  assert.equal(failed.length, 1);
  assert.ok(failed[0]!.warnings.some(warning => warning.code === 'QLOO_RESPONSE_TOO_LARGE'));
  assert.equal(audit.zeroViolationsGate.status, 'UNKNOWN');
});

test('health reports the live switch and effective caps', async () => {
  const response = await handleWorkerRequest(new Request('https://api.example/health'),
    { UNIT_LEDGER: {} as never, QLOO_API_KEY: 'k', LIVE_ENABLED: 'true', LIVE_DAILY_CAP: '150', LIVE_IP_CAP: '25' });
  const body = await response.json() as { liveEnabled: boolean; caps: { liveDaily: number; perClientDaily: number } };
  assert.equal(body.liveEnabled, true);
  assert.equal(body.caps.liveDaily, 150);
  assert.equal(body.caps.perClientDaily, 25);
});
