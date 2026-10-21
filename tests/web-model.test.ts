import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, createApiClient, createDemoResult, recomputeResult, validateLiveSelection } from '../web/src/data.ts';
import type { ApiDecisionResult, LiveSelection } from '../web/src/data.ts';
import { cancelledShow, decisionStatus, fitDisplay, formatDistance, formatDuration, formatMoney,
  knowledgeText, maxDailyDriving, optionById, optionCity, optionLetter, recommendedSummary,
  sameDecisionPolicy, selectedRecommendation } from '../web/src/presentation.ts';
import { createDecisionAudit, replayDecisionAudit } from '../src/core/audit.ts';
import type { FitInput } from '../src/core/fit-types.ts';
import type { QueryEvidence } from '../src/core/evidence-types.ts';
import type { Mutable } from './helpers/scenarios.ts';

const stamp = { generatedAt: '2026-10-21T12:00:00.000Z', runId: 'browser-fixture-test' };
const known = <T>(value: T) => ({ status: 'known' as const, value });
const unknown = (reason: string) => ({ status: 'unknown' as const, reason });
const selection: LiveSelection = {
  target: { id: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Resolved target' },
  comparisons: [
    { id: 'aaaaaaaa-0000-0000-0000-000000000002', name: 'Resolved comparison one' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000003', name: 'Resolved comparison two' },
  ],
  control: { id: 'aaaaaaaa-0000-0000-0000-000000000004', name: 'Resolved control' },
};

function response(value: unknown, status = 200, headers?: ConstructorParameters<typeof Headers>[0]): Response {
  return new Response(JSON.stringify(value), { status, ...(headers === undefined ? {} : { headers }) });
}

function fakeFetch(callback: (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => Response | Promise<Response>): typeof fetch {
  return (input, init) => Promise.resolve(callback(input, init));
}

/** Application-generated normalized live-shaped data, not a published provider response. */
function liveExample(): ApiDecisionResult {
  const demo = createDemoResult(stamp);
  const replay = demo.audit.replay;
  assert.equal(replay.fitInput.status, 'known');
  assert.equal(replay.controlFitInput.status, 'known');
  if (replay.fitInput.status !== 'known' || replay.controlFitInput.status !== 'known') assert.fail();
  const normalized = validateLiveSelection(selection);
  let comparisonIndex = 0;
  const fit = structuredClone(replay.fitInput.value) as Mutable<FitInput>;
  fit.profiles.forEach((profile, index) => {
    profile.artistId = profile.role === 'target' ? normalized.target.id : normalized.comparisons[comparisonIndex++]!.id;
    profile.queryId = `live-profile-${index}`;
    profile.provenance = { kind: 'recording-reference', reference: `private:${index}`, evidenceId: `opaque-${index}`,
      recordedAt: '2026-10-21T11:00:00.000Z', normalizationVersion: 'geohash-city-mean-v1' };
  });
  const control = structuredClone(replay.controlFitInput.value) as Mutable<FitInput>;
  control.profiles = fit.profiles.map(profile => profile.role === 'comparison' ? profile : {
    ...control.profiles.find(row => row.role === 'target')!, artistId: normalized.control.id, queryId: 'live-control',
    provenance: { kind: 'recording-reference', reference: 'private:control', evidenceId: 'opaque-control',
      recordedAt: '2026-10-21T11:00:00.000Z', normalizationVersion: 'geohash-city-mean-v1' },
  });
  const profiles = [...fit.profiles, control.profiles.find(row => row.role === 'target')!];
  const queries: QueryEvidence[] = profiles.map(profile => ({
    queryId: profile.queryId, operation: 'artist-heatmap', endpoint: '/v2/insights',
    parameters: { 'filter.type': 'urn:heatmap', 'signal.interests.entities': profile.artistId,
      'filter.location': 'POLYGON((5 47,16 47,16 56,5 56,5 47))', 'output.heatmap.boundary': 'urn:geohash' },
    startedAt: '2026-10-21T11:00:00.000Z', completedAt: '2026-10-21T11:00:01.000Z', source: 'cache', status: 'success',
    httpStatus: known(200), responseReference: known(profile.provenance.kind === 'recording-reference' ? profile.provenance.evidenceId : ''),
    responseRecordedAt: known('2026-10-21T11:00:00.000Z'), warnings: [],
  }));
  return { ...demo, mode: 'live', artists: normalized,
    audit: createDecisionAudit({ scenario: replay.scenario, fitInput: fit, controlFitInput: control,
      policy: replay.policy, ranges: replay.ranges, candidateSet: fit.candidateSet, queries,
      mode: 'live', ...stamp }) };
}

test('browser demo runs actual fixture, separates feasibility from preferences and never gives day off a taste score', () => {
  const demo = createDemoResult(stamp);
  assert.equal(demo.mode, 'demo');
  assert.equal(demo.audit.generatedAt, stamp.generatedAt);
  assert.equal(selectedRecommendation(demo)?.id, 'replacement-nuremberg');
  assert.equal(recommendedSummary(demo), 'A · Nuremberg');
  assert.equal(optionLetter(demo, 'day-off'), 'C');
  assert.equal(optionCity(demo, 'day-off'), 'Day off');
  assert.equal(cancelledShow(demo).cityId, 'de-leipzig');
  const b = optionById(demo, 'detour-frankfurt')!;
  assert.equal(b.status, 'PASS');
  assert.equal(decisionStatus(demo, b.id), 'FAIL');
  const c = optionById(demo, 'day-off')!;
  assert.equal(fitDisplay(c), 'N/A');
  assert.equal(c.fit.status, 'unknown');
  assert.ok(demo.audit.queries.every(row => row.source === 'synthetic' && row.httpStatus.status === 'unknown'));
  assert.deepEqual(replayDecisionAudit(demo.audit), demo.audit);
});

test('browser threshold replay witnesses the exact distance flip and retains all source timestamps and locked commitments', () => {
  const baseline = createDemoResult(stamp);
  const changed = recomputeResult(baseline, { maxAdditionalDistanceMetres: 354_097 }, {
    generatedAt: '2026-10-21T12:05:00.000Z', runId: 'browser-what-if',
  });
  assert.equal(selectedRecommendation(changed)?.id, 'detour-frankfurt');
  assert.deepEqual(changed.audit.queries, baseline.audit.queries);
  assert.deepEqual(changed.audit.sourceTimestamps, baseline.audit.sourceTimestamps);
  assert.equal(changed.audit.generatedAt, '2026-10-21T12:05:00.000Z');
  assert.equal(changed.audit.replay.policy.minimumFitIndex, baseline.audit.replay.policy.minimumFitIndex);
  assert.equal(sameDecisionPolicy(baseline, changed), false);
  assert.equal(sameDecisionPolicy(baseline, recomputeResult(baseline, {}, stamp)), true);
  assert.deepEqual(replayDecisionAudit(changed.audit), changed.audit);
  for (const option of changed.audit.analysis.repairs.options) {
    assert.deepEqual(option.route.filter(stop => stop.locked), baseline.audit.replay.scenario.tour.shows.filter(stop => stop.locked));
  }
  assert.equal(selectedRecommendation(recomputeResult(baseline, { maxAdditionalDistanceMetres: 354_096 }, stamp))?.id, 'replacement-nuremberg');
  assert.equal(selectedRecommendation(recomputeResult(baseline, { minimumFitIndex: 26 }, stamp))?.id, 'day-off');
  assert.equal(selectedRecommendation(recomputeResult(baseline, { additionalBudgetMinorUnits: 49_999 }, stamp))?.id, 'day-off');
  assert.throws(() => recomputeResult(baseline, { minimumFitIndex: 101 }, stamp));
  assert.throws(() => recomputeResult(baseline, { maxAdditionalDistanceMetres: 500_001 }, stamp));
});

test('display helpers preserve UNKNOWN and require complete daily-driving evidence', () => {
  const demo = createDemoResult(stamp);
  const option = optionById(demo, 'replacement-nuremberg')!;
  const duration = maxDailyDriving(option);
  assert.equal(duration.status, 'known');
  if (duration.status === 'known') assert.ok(duration.value <= 21_600);
  assert.deepEqual(maxDailyDriving({ ...option, totalDrivingSeconds: unknown('A directed leg is missing.') }), unknown('A directed leg is missing.'));
  assert.equal(maxDailyDriving({ ...option, checks: [...option.checks, { id: 'travel:missing:daily-driving', status: 'UNKNOWN', message: 'Missing', evidence: {} }] }).status, 'unknown');
  assert.equal(maxDailyDriving({ ...option, checks: [...option.checks, { id: 'travel:estimated:road', status: 'UNKNOWN', message: 'Estimated road evidence', evidence: {} }] }).status, 'unknown');
  assert.equal(knowledgeText(unknown('No data'), formatDistance), 'UNKNOWN');
  assert.equal(formatDistance(4_097, true, 3), '+4.097 km');
  assert.equal(formatDuration(3_660, true), '+1 h 1 min');
  assert.equal(formatMoney({ currency: 'EUR', minorUnits: 49_999 }), '€499.99');
});

test('live client sends selected UUIDs only to public Worker JSON endpoints and reattaches chosen names', async () => {
  const normalized = validateLiveSelection(selection);
  const payload = liveExample();
  let requestBody: unknown;
  const api = createApiClient('https://example.workers.dev', fakeFetch((input, init) => {
    assert.equal(String(input), 'https://example.workers.dev/api/live');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'omit');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    requestBody = JSON.parse(init?.body as string) as unknown;
    return response(payload);
  }));
  const result = await api.rescue(selection, payload.audit.replay.policy, 100_000);
  assert.deepEqual(result.artists, normalized);
  assert.deepEqual(requestBody, { scenarioId: 'germany-five-dates-v1', targetArtistId: normalized.target.id,
    comparisonArtistIds: normalized.comparisons.map(row => row.id), controlArtistId: normalized.control.id,
    policy: payload.audit.replay.policy, additionalBudgetMinorUnits: 100_000 });
  assert.deepEqual(result.audit, payload.audit);
  const refreshed = recomputeResult(result, { maxAdditionalDistanceMetres: 354_097 }, { ...stamp, generatedAt: '2026-10-20T12:00:00.000Z' });
  assert.equal(refreshed.mode, 'live');
  assert.equal(refreshed.audit.generatedAt, '2026-10-21T12:00:00.000Z');
  assert.deepEqual(refreshed.audit.queries, payload.audit.queries);
});

test('live HTTP 200 with failed provider evidence remains UNKNOWN and does not become synthetic', async () => {
  const payload = liveExample();
  const replay = payload.audit.replay;
  const failed = { ...payload, audit: createDecisionAudit({ scenario: replay.scenario,
    candidateSet: replay.candidateSet.status === 'known' ? replay.candidateSet.value : undefined,
    policy: replay.policy, ranges: replay.ranges, mode: 'live', ...stamp,
    queries: payload.audit.queries.map(query => ({ ...query, status: 'failed', httpStatus: known(429),
      responseReference: unknown('No response stored.'), responseRecordedAt: unknown('Request failed.') })),
    controlUnavailableReason: 'Provider rate limit blocked the evidence.',
  }) };
  const api = createApiClient('https://example.workers.dev', fakeFetch(() => response(failed)));
  const result = await api.rescue(selection);
  assert.equal(result.mode, 'live');
  assert.equal(result.audit.analysis.decision.recommendation.status, 'needs-evidence');
  assert.equal(result.audit.zeroViolationsGate.status, 'UNKNOWN');
  assert.ok(result.audit.queries.every(query => query.source !== 'synthetic'));
});

test('live errors retain 503/429/Retry-After and never return a fallback decision', async () => {
  for (const status of [503, 429]) {
    const code = status === 503 ? 'LIVE_DISABLED' : 'DAILY_LIMIT';
    const api = createApiClient('https://example.workers.dev', fakeFetch(() => response({ error: { code, message: 'Try the labelled demo.' } }, status, { 'Retry-After': '120' })));
    await assert.rejects(api.rescue(selection), (error: unknown) => error instanceof ApiError
      && error.status === status && error.code === code && error.retryAfterSeconds === 120);
  }
  const offline = createApiClient('https://example.workers.dev', fakeFetch(() => { throw new TypeError('Network failed'); }));
  await assert.rejects(offline.rescue(selection), (error: unknown) => error instanceof ApiError && error.code === 'NETWORK_ERROR');
  const demoOnLive = createApiClient('https://example.workers.dev', fakeFetch(() => response(createDemoResult(stamp))));
  await assert.rejects(demoOnLive.rescue(selection), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
});

test('unsupported response bodies and mismatched artist identities are rejected before display', async () => {
  const payload = liveExample();
  for (const bad of [{}, { ...payload, audit: { schemaVersion: 'unknown' } },
    { ...payload, artists: { ...payload.artists, target: payload.artists.control } }]) {
    await assert.rejects(createApiClient('https://example.workers.dev', fakeFetch(() => response(bad))).rescue(selection),
      (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
  }
  // A forged label is ignored; replayed checks determine the accepted recommendation.
  const altered = structuredClone(payload) as Mutable<ApiDecisionResult>;
  altered.audit.zeroViolationsGate.status = 'FAIL';
  altered.audit.analysis.decision.recommendation = { status: 'no-feasible-option', reason: 'Forged label.' };
  const accepted = await createApiClient('https://example.workers.dev', fakeFetch(() => response(altered))).rescue(selection);
  assert.deepEqual(accepted.audit, payload.audit);
});

test('search is explicit, validates selected IDs, and never calls Worker for invalid input', async () => {
  let calls = 0;
  const api = createApiClient('https://example.workers.dev/', fakeFetch((input, init) => {
    calls += 1;
    assert.equal(String(input), 'https://example.workers.dev/api/live/search');
    assert.deepEqual(JSON.parse(init?.body as string), { query: 'The Artist' });
    return response({ mode: 'live', artists: [selection.target], queries: [] });
  }));
  await assert.rejects(api.search('a'), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_SEARCH');
  await assert.rejects(api.rescue({ ...selection, comparisons: [selection.target] }), (error: unknown) => error instanceof ApiError && error.code === 'DUPLICATE_ARTISTS');
  await assert.rejects(api.rescue({ ...selection, target: { id: 'artist name as free text' } }), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_SELECTION');
  assert.equal(calls, 0);
  assert.deepEqual(await api.search('  The Artist  '), [{ ...selection.target, id: selection.target.id.toUpperCase() }]);
  assert.equal(calls, 1);
  assert.throws(() => createApiClient('https://user:secret@example.workers.dev'), /without credentials/);
  assert.throws(() => createApiClient('https://example.workers.dev/?key=secret'), /without credentials/);
});
