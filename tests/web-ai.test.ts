import assert from 'node:assert/strict';
import test from 'node:test';
import { createDecisionAudit } from '../src/core/audit.ts';
import type { FitInput } from '../src/core/fit-types.ts';
import type { QueryEvidence } from '../src/core/evidence-types.ts';
import { createAiDemoSession } from '../src/ai/demo.ts';
import { validateAiProposal } from '../src/ai/tools.ts';
import type { AiDecisionContext, AiSessionResult, AiSource, AiStep } from '../src/ai/types.ts';
import { ApiError, createDemoResult } from '../web/src/data.ts';
import { createAiClient, parseAiSession, readAiStream } from '../web/src/ai-client.ts';

const at = '2026-10-21T14:00:00.000Z';
const acquiredAt = '2026-10-21T13:00:00.000Z';
const known = <T>(value: T) => ({ status: 'known' as const, value });
const isInvalid = (error: unknown) => error instanceof ApiError && error.code === 'INVALID_AI_RESPONSE';

/** Application-generated test evidence, never an assertion of a real provider response. */
function makeLiveBase(): AiDecisionContext {
  const demo = createDemoResult({ generatedAt: at, runId: 'test-base' });
  const replay = demo.audit.replay;
  if (replay.fitInput.status !== 'known' || replay.controlFitInput.status !== 'known') assert.fail();
  const ids = ['A0000000-0000-0000-0000-000000000001', 'A0000000-0000-0000-0000-000000000002',
    'A0000000-0000-0000-0000-000000000003', 'A0000000-0000-0000-0000-000000000004'];
  let comparisonIndex = 1;
  const fit: FitInput = { ...replay.fitInput.value, profiles: replay.fitInput.value.profiles.map((profile, index) => ({
    ...profile, artistId: profile.role === 'target' ? ids[0]! : ids[comparisonIndex++]!, queryId: `live-${index}`,
    provenance: { kind: 'recording-reference' as const, reference: `private:test-${index}`, evidenceId: `test-${index}`,
      recordedAt: acquiredAt, normalizationVersion: 'geohash-city-mean-v1' },
  })) };
  const controlTarget = replay.controlFitInput.value.profiles.find(row => row.role === 'target')!;
  const control: FitInput = { ...replay.controlFitInput.value, profiles: fit.profiles.map(profile => profile.role === 'comparison' ? profile : {
    ...controlTarget, artistId: ids[3]!, queryId: 'live-control',
    provenance: { kind: 'recording-reference' as const, reference: 'private:test-control', evidenceId: 'test-control',
      recordedAt: acquiredAt, normalizationVersion: 'geohash-city-mean-v1' },
  }) };
  const queries: QueryEvidence[] = [...fit.profiles, control.profiles.find(profile => profile.role === 'target')!].map(profile => ({
    queryId: profile.queryId, operation: 'artist-heatmap', endpoint: '/v2/insights',
    parameters: { 'filter.type': 'urn:heatmap', 'signal.interests.entities': profile.artistId,
      'filter.location': 'POLYGON((5 47,16 47,16 56,5 56,5 47))', 'output.heatmap.boundary': 'urn:geohash' },
    startedAt: acquiredAt, completedAt: acquiredAt, source: 'cache', status: 'success', httpStatus: known(200),
    responseReference: known(profile.provenance.kind === 'recording-reference' ? profile.provenance.evidenceId : ''),
    responseRecordedAt: known(acquiredAt), warnings: [],
  }));
  return { schemaVersion: 'tour-rescue.api-result.v1', mode: 'live', scenarioId: demo.scenarioId,
    artists: { target: { id: ids[0]!, name: 'Test target' }, comparisons: [{ id: ids[1]! }, { id: ids[2]! }], control: { id: ids[3]! } },
    audit: createDecisionAudit({ scenario: replay.scenario, policy: replay.policy, ranges: replay.ranges,
      fitInput: fit, controlFitInput: control, candidateSet: fit.candidateSet, queries, generatedAt: at, runId: 'server-base-1', mode: 'live' }) };
}

const base = makeLiveBase();
const sources: AiSource[] = [{ id: 'source-1', title: 'Test calendar', url: 'https://venue.example.com/calendar',
  retrievedAt: at, kind: 'web-fetch', provenance: 'provider-tool', excerpt: 'A synthetic test excerpt. No availability assertion.' }];
const steps: AiStep[] = [{ sequence: 1, at, type: 'research', message: 'Read the café calendar. Its missing date does not confirm availability.', sourceIds: ['source-1'] }];
const session: AiSessionResult = {
  schemaVersion: 'tour-rescue.ai-session.v1', sessionId: 'session-test-1', mode: 'live', scenarioId: base.scenarioId,
  model: 'claude-sonnet-5-5', startedAt: at, completedAt: at, baseResult: base, steps, sources,
  proposals: [
    { id: 'nuremberg-test', kind: 'replacement' as const, cityId: 'de-nuremberg', venueName: 'Test Nuremberg room', reason: 'Investigate the corridor.', sourceIds: ['source-1'], risks: ['Availability is unconfirmed.'] },
    { id: 'frankfurt-test', kind: 'detour' as const, cityId: 'de-frankfurt', venueName: 'Test Frankfurt room', reason: 'Compare an alternative market.', sourceIds: ['source-1'], risks: ['Fee and availability are unconfirmed.'] },
  ].map(draft => validateAiProposal(base.audit, draft, sources, { generatedAt: at, runId: `validate-${draft.id}` })),
  usage: { inputTokens: 2_000, outputTokens: 900, modelCalls: 2, toolCalls: 4, webSearchCalls: 1, webFetchCalls: 1 },
  stopReason: 'completed', warnings: ['This test response was generated locally.'],
};

function ndjson(lines: readonly unknown[], chunked = false): Response {
  const bytes = new TextEncoder().encode(lines.map(line => JSON.stringify(line)).join('\n') + '\n');
  if (!chunked) return new Response(bytes, { headers: { 'Content-Type': 'application/x-ndjson' } });
  // Deliberately split the UTF-8 encoding of é, then use ordinary chunks for the large audit.
  const split = bytes.findIndex((value, index) => value === 0xc3 && bytes[index + 1] === 0xa9) + 1;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes.slice(0, split));
    for (let offset = split; offset < bytes.length; offset += 65_536) controller.enqueue(bytes.slice(offset, offset + 65_536));
    controller.close();
  } });
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}

test('AI browser parses both saved demos and preserves UNKNOWN in the evidence-gap transcript', () => {
  for (const id of ['corridor-repair', 'evidence-gaps'] as const) {
    const demo = createAiDemoSession(id, { generatedAt: at, sessionId: `demo-${id}` });
    const parsed = parseAiSession(demo, 'demo');
    assert.deepEqual(parsed.proposals.map(row => row.status), demo.proposals.map(row => row.status));
    assert.equal(parsed.usage.modelCalls, 0);
    if (id === 'evidence-gaps') assert.ok(parsed.proposals.every(row => row.option.venueStatus === 'UNKNOWN'));
  }
});

test('AI browser recomputes all decisions and ignores forged PASS labels and model metrics', () => {
  const forged = { ...session, proposals: session.proposals.map(row => ({ ...row, status: 'PASS', option: { ...row.option,
    status: 'PASS', fit: known(100), additionalDistanceMetres: known(0) } })) };
  const parsed = parseAiSession(forged, 'live', base);
  assert.deepEqual(parsed.proposals.map(row => row.status), session.proposals.map(row => row.status));
  assert.equal(parsed.proposals[0]!.option.venueStatus, 'UNKNOWN');
  assert.notEqual(parsed.proposals[0]!.option.fit.status === 'known' ? parsed.proposals[0]!.option.fit.value : undefined, 100);
  assert.deepEqual(parsed.proposals[0]!.option.route.filter(row => row.locked), base.audit.replay.scenario.tour.shows.filter(row => row.locked));
});

test('AI browser rejects invented source IDs, unsafe links, artist swaps and live synthetic substitution', () => {
  const first = session.proposals[0]!;
  const bad = [
    { ...session, proposals: [{ ...first, draft: { ...first.draft, sourceIds: ['invented'] } }, session.proposals[1]!] },
    { ...session, proposals: [{ ...first, draft: { ...first.draft, availability: true } }, session.proposals[1]!] },
    { ...session, sources: [{ ...sources[0]!, url: 'https://user:secret@venue.example.com/calendar' }] },
    { ...session, sources: [{ ...sources[0]!, url: 'http://127.0.0.1/' }] },
    { ...session, sources: [{ ...sources[0]!, kind: 'synthetic', provenance: 'synthetic' }] },
    { ...session, baseResult: { ...base, artists: { ...base.artists, target: base.artists.control } } },
    { ...session, proposals: [first] },
    { ...session, proposals: [first, first] },
    { ...session, model: 'some-other-model' },
    createAiDemoSession('corridor-repair', { generatedAt: at }),
  ];
  for (const input of bad) assert.throws(() => parseAiSession(input, 'live', base), isInvalid);
});

test('AI NDJSON reader handles split UTF-8, streams public steps and releases result only at EOF', async () => {
  const observed: string[] = [];
  const parsed = await readAiStream(ndjson([{ type: 'step', step: steps[0] }, { type: 'result', result: session }], true), event => observed.push(event.type), base);
  assert.deepEqual(observed, ['step', 'result']);
  assert.equal(parsed.steps[0]!.message, steps[0]!.message);
  assert.equal(parsed.sessionId, session.sessionId);
});

test('AI NDJSON rejects duplicate finals, incomplete streams, reordered steps and different session activity', async () => {
  const final = { type: 'result', result: session };
  for (const lines of [
    [{ type: 'step', step: steps[0] }],
    [final, final],
    [final, { type: 'step', step: steps[0] }],
    [{ type: 'step', step: { ...steps[0], sequence: 2 } }, final],
    [{ type: 'step', step: { ...steps[0], message: 'Different session content.' } }, final],
  ]) {
    const events: string[] = [];
    await assert.rejects(readAiStream(ndjson(lines), event => events.push(event.type), base), isInvalid);
    assert.ok(!events.includes('result'));
  }
  await assert.rejects(readAiStream(new Response('{"type":"result"', { headers: { 'Content-Type': 'application/x-ndjson' } }), () => {}), isInvalid);
  await assert.rejects(readAiStream(new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } }), () => {}), isInvalid);
});

test('AI NDJSON preserves quota errors and stops reading on cancellation or oversized content', async () => {
  await assert.rejects(readAiStream(new Response(JSON.stringify({ error: { code: 'AI_DAILY_LIMIT', message: 'Daily allowance reached.' } }), {
    status: 429, headers: { 'Retry-After': '400' },
  }), () => {}), error => error instanceof ApiError && error.code === 'AI_DAILY_LIMIT' && error.retryAfterSeconds === 400);
  await assert.rejects(readAiStream(ndjson([{ type: 'error', error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'The model is unavailable.' } }]), () => {}),
    error => error instanceof ApiError && error.code === 'AI_PROVIDER_UNAVAILABLE');
  const controller = new AbortController();
  let cancelled = false;
  const open = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const promise = readAiStream(new Response(open, { headers: { 'Content-Type': 'application/x-ndjson' } }), () => {}, base, controller.signal);
  controller.abort(new Error('test cancellation'));
  await assert.rejects(promise, /test cancellation/);
  assert.equal(cancelled, true);
  await assert.rejects(readAiStream(new Response('x'.repeat(8 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'application/x-ndjson' } }), () => {}), isInvalid);
});

test('AI client sends only a bounded server baseline reference and requested preferences', async () => {
  const calls: { url: string; input: RequestInit | undefined }[] = [];
  const client = createAiClient('https://test.workers.dev', async (url, input) => {
    calls.push({ url: String(url), input });
    if (String(url).endsWith('/health')) return new Response(JSON.stringify({ aiEnabled: true }));
    return ndjson([{ type: 'result', result: session }]);
  });
  assert.equal((await client.health()).enabled, true);
  await client.rescue({ baseRunId: base.audit.runId, policy: base.audit.replay.policy, additionalBudgetMinorUnits: 100_000 }, base, () => {});
  assert.equal(calls[1]!.url, 'https://test.workers.dev/api/ai/live');
  assert.equal(calls[1]!.input?.method, 'POST');
  assert.equal(calls[1]!.input?.credentials, 'omit');
  assert.deepEqual(JSON.parse(calls[1]!.input?.body as string), { baseRunId: base.audit.runId, policy: base.audit.replay.policy, additionalBudgetMinorUnits: 100_000 });
  assert.ok(!String(calls[1]!.input?.body).includes('QLOO_API_KEY'));
  await assert.rejects(client.rescue({ baseRunId: 'bad / id' }, base, () => {}), error => error instanceof ApiError && error.code === 'AI_BASE_REQUIRED');
  assert.equal(calls.length, 2);
  assert.throws(() => createAiClient('https://user:secret@test.workers.dev'), /without credentials/);
  assert.throws(() => createAiClient('https://test.workers.dev/path'), /without credentials/);
});

test('AI unavailable health or network never substitutes a saved demo for a live result', async () => {
  const old = createAiClient('https://test.workers.dev', async () => new Response(JSON.stringify({ liveEnabled: true })));
  await assert.rejects(old.health(), error => error instanceof ApiError && error.code === 'AI_UNAVAILABLE');
  const offline = createAiClient('https://test.workers.dev', async () => { throw new TypeError('Network failed'); });
  await assert.rejects(offline.rescue({ baseRunId: base.audit.runId }, base, () => {}), error => error instanceof ApiError && error.code === 'AI_NETWORK_ERROR');
  const controller = new AbortController();
  controller.abort(new Error('test aborted'));
  await assert.rejects(offline.rescue({ baseRunId: base.audit.runId }, base, () => {}, controller.signal), /test aborted/);
});
