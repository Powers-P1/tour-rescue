import assert from 'node:assert/strict';
import test from 'node:test';
import { createDecisionAudit, evaluateZeroViolationsGate, replayDecisionAudit } from '../src/core/audit.ts';
import type { CreateDecisionAuditInput } from '../src/core/audit-types.ts';
import type { QueryEvidence } from '../src/core/evidence-types.ts';
import type { FitInput } from '../src/core/fit-types.ts';
import type { DecisionPolicy } from '../src/core/decision-types.ts';
import type { BreakpointRanges } from '../src/core/breakpoint.ts';
import { parseSyntheticHeatmapFitInput } from '../src/core/scenario-fit.ts';
import { evaluateTourDecision } from '../src/core/decision-analysis.ts';
import { fixture, freezeDeep, germanyScenario } from './helpers/scenarios.ts';
import type { Mutable } from './helpers/scenarios.ts';

const generatedAt = '2026-10-21T12:00:00.000Z';
const queryTime = '2026-10-21T11:00:00.000Z';
const region = 'POLYGON((5 47,16 47,16 56,5 56,5 47))';
const unknown = (reason: string) => ({ status: 'unknown' as const, reason });
const known = <T>(value: T) => ({ status: 'known' as const, value });
const fitInput = () => parseSyntheticHeatmapFitInput(fixture('qloo/heatmap_de_synthetic.json'));
function preferences(): { policy: DecisionPolicy; ranges: BreakpointRanges } {
  return fixture('synthetic/decision__germany__policy.json') as ReturnType<typeof preferences>;
}

function controlFor(fit: FitInput): FitInput {
  return {
    ...fit,
    profiles: fit.profiles.map(profile => profile.role === 'comparison' ? profile : {
      ...profile, artistId: 'synthetic-control-artist', queryId: 'synthetic-control-query',
      provenance: { kind: 'synthetic', reference: 'hand-written-control-test' },
      observations: profile.observations.map(row => ({ cityId: row.cityId,
        affinity: row.affinity.status === 'unknown' ? row.affinity : known(1 - row.affinity.value) })),
    }),
  };
}

function logsFor(...inputs: FitInput[]): QueryEvidence[] {
  const profiles = [...new Map(inputs.flatMap(input => input.profiles.map(profile => [profile.queryId, profile] as const))).values()];
  return profiles.map(profile => ({
    queryId: profile.queryId, operation: 'artist-heatmap', endpoint: '/v2/insights',
    parameters: { 'filter.type': 'urn:heatmap', 'signal.interests.entities': profile.artistId,
      'filter.location': region, 'output.heatmap.boundary': 'urn:geohash' },
    startedAt: queryTime, completedAt: queryTime, source: profile.provenance.kind === 'synthetic' ? 'synthetic' : 'live', status: 'success',
    httpStatus: profile.provenance.kind === 'synthetic' ? unknown('No HTTP request was made.') : known(200),
    responseReference: profile.provenance.kind === 'synthetic' ? unknown('Synthetic fixture, no upstream response.') : known(profile.provenance.evidenceId),
    responseRecordedAt: profile.provenance.kind === 'synthetic' ? unknown('Synthetic fixture has no acquisition time.') : known(profile.provenance.recordedAt),
    warnings: [],
  }));
}

function example(withControl = true): CreateDecisionAuditInput {
  const fit = fitInput();
  const control = controlFor(fit);
  return {
    scenario: germanyScenario(), fitInput: fit,
    ...(withControl ? { controlFitInput: control } : {}),
    ...preferences(), queries: logsFor(fit, ...(withControl ? [control] : [])),
    generatedAt, runId: 'audit-synthetic-germany-v1', mode: 'demo',
  };
}

test('audit records frozen evidence, bounded breakpoints, control and leave-one-out without booking claims', () => {
  const audit = createDecisionAudit(example());
  assert.equal(audit.schemaVersion, 'tour-rescue.decision-audit.v1');
  assert.equal(audit.generatedAt, generatedAt);
  assert.equal(audit.mode, 'demo');
  assert.equal(audit.frozenCandidateSet.status, 'known');
  if (audit.frozenCandidateSet.status !== 'known') assert.fail();
  assert.equal(audit.frozenCandidateSet.value.cityIds.length, 24);
  assert.equal(audit.queries.length, 4);
  assert.equal(audit.analysis.artistSensitivity.runs.length, 2);
  assert.equal(audit.analysis.breakpoints.axes.length, 3);
  assert.equal(audit.controlRun.status, 'known');
  assert.equal(audit.zeroViolationsGate.status, 'PASS');
  assert.deepEqual(audit.zeroViolationsGate.violatedCheckCount, known(0));
  assert.deepEqual(audit.zeroViolationsGate.unresolvedCheckCount, known(0));
  assert.match(audit.zeroViolationsGate.reason, /not a booking confirmation/);
  assert.equal(audit.sourceTimestamps.road.method, 'osrm-table');
  assert.equal(audit.sourceTimestamps.road.recordedAt.status, 'known');
  assert.ok(audit.sourceTimestamps.qloo.every(source => source.recordedAt.status === 'unknown'));
});

test('stop changes retain four locked commitments and distinguish replacement of cancelled slot from day off', () => {
  const audit = createDecisionAudit(example());
  for (const option of audit.stopChanges.originalToOptions) {
    assert.equal(option.lockedCommitments.status, 'PASS');
    assert.deepEqual(option.unchangedLockedShowIds, ['show-1', 'show-2', 'show-4', 'show-5']);
    assert.equal(option.changedStopCount, 1);
    assert.equal(option.changes[0]?.showId, 'show-3');
    assert.equal(option.beforeStopCount, 5);
    if (option.optionId === 'day-off') {
      assert.equal(option.afterStopCount, 4);
      assert.equal(option.changes[0]?.kind, 'removed');
    } else {
      assert.equal(option.afterStopCount, 5);
      assert.equal(option.changes[0]?.kind, 'modified');
      assert.deepEqual(option.changes[0]?.changedFields, ['cityId', 'venueId', 'status']);
    }
  }
});

test('different target can change the selected repair while scenario, comparisons and all locked dates stay fixed', () => {
  const input = example();
  const audit = createDecisionAudit({ ...input, policy: { ...preferences().policy, maxAdditionalDistanceMetres: 400000 } });
  assert.equal(audit.controlRun.status, 'known');
  if (audit.controlRun.status !== 'known') assert.fail();
  assert.deepEqual(audit.controlRun.value.recommendedOptionChanged, known(true));
  assert.equal(audit.stopChanges.recommendedBaselineToControl.status, 'known');
  if (audit.stopChanges.recommendedBaselineToControl.status !== 'known') assert.fail();
  assert.equal(audit.stopChanges.recommendedBaselineToControl.value.changedStopCount, 1);
  for (const option of audit.controlRun.value.repairs.options) {
    assert.deepEqual(option.route.filter(stop => stop.locked), germanyScenario().tour.shows.filter(stop => stop.locked));
  }
});

test('missing control stays UNKNOWN, while missing baseline evidence cannot acquire a zero-violations pass', () => {
  const noControl = createDecisionAudit({ ...example(false), controlUnavailableReason: 'No control response was acquired.' });
  assert.deepEqual(noControl.controlRun, unknown('No control response was acquired.'));
  assert.equal(noControl.stopChanges.recommendedBaselineToControl.status, 'unknown');
  assert.ok(noControl.warnings.some(warning => warning.code === 'CONTROL_UNAVAILABLE'));
  const { fitInput: _fit, ...withoutFit } = example(false);
  const noFit = createDecisionAudit({ ...withoutFit, mode: 'live', queries: [{
    ...logsFor(fitInput())[0]!, source: 'live', status: 'failed', httpStatus: known(429),
    warnings: [{ code: 'QLOO_RATE_LIMIT', message: 'Provider rejected the request limit.', queryId: fitInput().profiles[0]!.queryId }],
  }] });
  assert.equal(noFit.analysis.decision.recommendation.status, 'needs-evidence');
  assert.equal(noFit.zeroViolationsGate.status, 'UNKNOWN');
  assert.equal(noFit.zeroViolationsGate.violatedCheckCount.status, 'unknown');
  assert.equal(noFit.frozenCandidateSet.status, 'unknown');
  assert.ok(noFit.warnings.some(warning => warning.code === 'FIT_UNAVAILABLE'));
  assert.ok(noFit.warnings.some(warning => warning.code === 'QLOO_RATE_LIMIT'));
  const withDeclaredSet = createDecisionAudit({ ...withoutFit, candidateSet: fitInput().candidateSet });
  assert.equal(withDeclaredSet.frozenCandidateSet.status, 'known');
  if (withDeclaredSet.frozenCandidateSet.status !== 'known') assert.fail();
  assert.equal(withDeclaredSet.frozenCandidateSet.value.cityIds.length, 24);
  assert.deepEqual(replayDecisionAudit(withDeclaredSet), withDeclaredSet);
});

test('zero-violations gate independently refuses forged PASS, unresolved checks and absent check traces', () => {
  const decision = structuredClone(evaluateTourDecision(germanyScenario(), fitInput(), preferences().policy).decision) as Mutable<ReturnType<typeof evaluateTourDecision>['decision']>;
  assert.equal(decision.recommendation.status, 'recommended');
  if (decision.recommendation.status !== 'recommended') assert.fail();
  const optionId = decision.recommendation.optionId;
  const recommended = decision.options.find(option => option.optionId === optionId)!;
  recommended.checks[0]!.status = 'FAIL';
  let gate = evaluateZeroViolationsGate(decision);
  assert.equal(gate.status, 'FAIL');
  assert.deepEqual(gate.violatedCheckCount, known(1));
  recommended.checks[0]!.status = 'UNKNOWN';
  gate = evaluateZeroViolationsGate(decision);
  assert.equal(gate.status, 'UNKNOWN');
  assert.deepEqual(gate.violatedCheckCount, known(0));
  assert.deepEqual(gate.unresolvedCheckCount, known(1));
  recommended.checks = [];
  assert.equal(evaluateZeroViolationsGate(decision).status, 'FAIL');
});

test('rank-only replay reproduces the complete audit without exposing original query affinities', () => {
  const input = example();
  const fit = structuredClone(input.fitInput) as Mutable<FitInput>;
  fit.profiles[0]!.observations[0]!.affinity = known(0.123456789012345);
  const control = controlFor(fit);
  const audit = createDecisionAudit({ ...input, fitInput: fit, controlFitInput: control, queries: logsFor(fit, control) });
  assert.ok(!JSON.stringify(audit).includes('0.123456789012345'));
  assert.equal(audit.replay.fitRepresentation, 'within-query-percentiles-preserving-missingness');
  assert.deepEqual(replayDecisionAudit(JSON.parse(JSON.stringify(audit))), audit);
});

test('replay preserves an incomplete profile mask and genuine ties, including leave-one-out warnings', () => {
  const input = example(false);
  const fit = structuredClone(input.fitInput) as Mutable<FitInput>;
  fit.profiles[1]!.observations[0]!.affinity = unknown('No mapped cell for this city.');
  fit.profiles[0]!.observations[1]!.affinity = known(0.1234);
  fit.profiles[0]!.observations[2]!.affinity = known(0.1234);
  const audit = createDecisionAudit({ ...input, fitInput: fit });
  assert.equal(audit.analysis.decision.recommendation.status, 'needs-evidence');
  assert.equal(audit.zeroViolationsGate.status, 'UNKNOWN');
  assert.equal(audit.replay.fitInput.status, 'known');
  if (audit.replay.fitInput.status !== 'known') assert.fail();
  const replayProfile = audit.replay.fitInput.value.profiles.find(profile => profile.queryId === fit.profiles[1]!.queryId)!;
  assert.equal(replayProfile.observations.filter(row => row.affinity.status === 'unknown').length, 1);
  assert.deepEqual(replayDecisionAudit(audit), audit);
});

test('control rejects changes to comparisons, frozen city universe, weights and target identity', () => {
  const input = example();
  const fit = input.fitInput as FitInput;
  assert.throws(() => createDecisionAudit({ ...input, controlFitInput: fit }), /different target artist/);
  const changedComparison = structuredClone(input.controlFitInput) as Mutable<FitInput>;
  changedComparison.profiles[1]!.observations[0]!.affinity = known(0.314159);
  assert.throws(() => createDecisionAudit({ ...input, controlFitInput: changedComparison }), /every comparison artist/);
  const changedSet = structuredClone(input.controlFitInput) as Mutable<FitInput>;
  changedSet.candidateSet.id = 'another-universe';
  changedSet.profiles.forEach(profile => { profile.candidateSetId = changedSet.candidateSet.id; });
  assert.throws(() => createDecisionAudit({ ...input, controlFitInput: changedSet }), /frozen baseline city set/);
  const changedWeight = structuredClone(input.controlFitInput) as Mutable<FitInput>;
  changedWeight.profiles[0]!.weight = 0.6;
  changedWeight.profiles[1]!.weight = 0.2;
  changedWeight.profiles[2]!.weight = 0.2;
  assert.throws(() => createDecisionAudit({ ...input, controlFitInput: changedWeight }), /weight/);
});

test('query trace projects safe fields and rejects secret parameters, ignored heatmap take and mismatched identities', () => {
  const input = example(false);
  const extra = input.queries.map(query => ({ ...query, headers: { 'X-Api-Key': 'DO-NOT-EXPORT' }, response: { heatmap: 'RAW-RESPONSE' } }));
  const audit = createDecisionAudit({ ...input, queries: extra });
  assert.ok(!JSON.stringify(audit).includes('DO-NOT-EXPORT'));
  assert.ok(!JSON.stringify(audit).includes('RAW-RESPONSE'));
  for (const parameter of ['X-Api-Key', 'api_key', 'take']) {
    const queries = input.queries.map((query, index) => index === 0 ? { ...query, parameters: { ...query.parameters, [parameter]: '20' } } : query);
    assert.throws(() => createDecisionAudit({ ...input, queries }), /unapproved parameter/);
  }
  const wrongArtist = input.queries.map((query, index) => index === 0 ? { ...query, parameters: { ...query.parameters, 'signal.interests.entities': 'another-artist' } } : query);
  assert.throws(() => createDecisionAudit({ ...input, queries: wrongArtist }), /artist does not match/);
  assert.throws(() => createDecisionAudit({ ...input, queries: input.queries.slice(1) }), /successful artist-heatmap record/);
});

test('different query regions and fabricated synthetic HTTP timestamps cannot enter the audit', () => {
  const input = example(false);
  const changedRegion = input.queries.map((query, index) => index === 0 ? { ...query, parameters: { ...query.parameters, 'filter.location': 'POINT(13 52)' } } : query);
  assert.throws(() => createDecisionAudit({ ...input, queries: changedRegion }), /same frozen query region/);
  const fakeHTTP = input.queries.map((query, index) => index === 0 ? { ...query, httpStatus: known(200) } : query);
  assert.throws(() => createDecisionAudit({ ...input, queries: fakeHTTP }), /synthetic evidence cannot claim/);
  const fakeTime = input.queries.map((query, index) => index === 0 ? { ...query, responseRecordedAt: known(queryTime) } : query);
  assert.throws(() => createDecisionAudit({ ...input, queries: fakeTime }), /synthetic evidence cannot claim/);
});

test('live and cached acquisition references remain bound to profile provenance and retain original recording time', () => {
  const fit = structuredClone(fitInput()) as Mutable<FitInput>;
  for (const profile of fit.profiles) profile.provenance = {
    kind: 'recording-reference', reference: `private:${profile.queryId}`, evidenceId: `recording-${profile.queryId}`,
    recordedAt: '2026-10-20T10:00:00.000Z', normalizationVersion: 'geohash-city-mean-v1',
  };
  const queries = logsFor(fit).map(query => ({ ...query, source: 'cache' as const }));
  const audit = createDecisionAudit({ ...example(false), fitInput: fit, queries, mode: 'live' });
  assert.ok(audit.sourceTimestamps.qloo.every(source => source.recordedAt.status === 'known' && source.recordedAt.value === '2026-10-20T10:00:00.000Z'));
  const wrongReference = queries.map((query, index) => index === 0 ? { ...query, responseReference: known('unrelated-recording') } : query);
  assert.throws(() => createDecisionAudit({ ...example(false), fitInput: fit, queries: wrongReference, mode: 'live' }), /recording provenance must match/);
  assert.deepEqual(replayDecisionAudit(audit), audit);
});

test('audit timestamps reject implicit offsets, calendar rollover, future request completion and reversed intervals', () => {
  const input = example(false);
  for (const value of ['2026-10-21T12:00:00', '2026-02-30T12:00:00Z', '2026-10-21T25:00:00Z']) {
    assert.throws(() => createDecisionAudit({ ...input, generatedAt: value }), /ISO instant|invalid calendar/);
  }
  for (const patch of [{ completedAt: '2026-10-22T12:00:00Z' }, { startedAt: '2026-10-21T11:01:00Z' }]) {
    const queries = input.queries.map((query, index) => index === 0 ? { ...query, ...patch } : query);
    assert.throws(() => createDecisionAudit({ ...input, queries }), /request times must be ordered/);
  }
});

test('audit is deterministic JSON, leaves frozen inputs untouched and replay recomputes rather than trusting edited results', () => {
  const input = example();
  const snapshot = structuredClone(input);
  freezeDeep(input);
  const audit = createDecisionAudit(input);
  assert.deepEqual(createDecisionAudit(input), audit);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(audit)), audit);
  const tampered = structuredClone(audit) as Mutable<typeof audit>;
  tampered.zeroViolationsGate.status = 'FAIL';
  tampered.analysis.decision.recommendation = { status: 'no-feasible-option', reason: 'Forged browser result.' };
  assert.deepEqual(replayDecisionAudit(tampered), audit);
});
