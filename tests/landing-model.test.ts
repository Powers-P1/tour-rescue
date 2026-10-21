import assert from 'node:assert/strict';
import test from 'node:test';
import { createDecisionAudit } from '../src/core/audit.ts';
import { createDemoResult, recomputeResult } from '../web/src/data.ts';
import { createLandingModel } from '../web/src/landing-model.ts';

const stamp = { generatedAt: '2026-10-21T12:00:00.000Z', runId: 'landing-model-test' };

test('landing projects the current demo numbers and separates feasibility from preference gates', () => {
  const result = createDemoResult(stamp);
  const model = createLandingModel(result);
  assert.equal(model.artistName, 'The Harbour Lights');
  assert.equal(model.region, 'Germany');
  assert.equal(model.shows.length, 5);
  assert.equal(model.lockedShowCount, 4);
  assert.equal(model.cancelledShowCount, 1);
  assert.deepEqual(model.shows.map(show => show.cityName), ['Hamburg', 'Berlin', 'Leipzig', 'Munich', 'Cologne']);
  assert.equal(model.shows[2]!.dateLabel, '14 Nov');
  assert.equal(model.proposedStop.status, 'known');
  if (model.proposedStop.status === 'known') {
    assert.equal(model.proposedStop.value.cityName, 'Nuremberg');
    assert.deepEqual(model.proposedStop.value.startsAt, model.shows[2]!.startsAt);
  }
  assert.deepEqual(model.options.map(option => ({
    city: option.cityName, fit: option.fitText, distance: option.additionalDistanceText,
    feasibility: option.feasibilityStatus, decision: option.decisionStatus, recommended: option.recommended,
  })), [
    { city: 'Nuremberg', fit: '25 / 100', distance: '+18.4 km', feasibility: 'PASS', decision: 'PASS', recommended: true },
    { city: 'Frankfurt am Main', fit: '58.7 / 100', distance: '+354.1 km', feasibility: 'PASS', decision: 'FAIL', recommended: false },
    { city: 'Day off', fit: 'N/A', distance: '0 km', feasibility: 'PASS', decision: 'PASS', recommended: false },
  ]);
  assert.deepEqual(model.options[0]!.additionalDistanceMetres, { status: 'known', value: 18368 });
  assert.deepEqual(model.options[1]!.additionalDistanceMetres, { status: 'known', value: 354097 });
  assert.equal(model.options[1]!.note, 'Over the 350 km extra-distance cap');
  assert.equal(model.zeroViolationsGate.status, 'PASS');
  assert.match(model.disclosure, /Synthetic taste profiles/);
  assert.match(model.disclosure, /not a ticket forecast/);
});

test('landing breakpoint is the core one-metre witness and its recommendation actually reverses', () => {
  const result = createDemoResult(stamp);
  const model = createLandingModel(result);
  const axis = result.audit.analysis.breakpoints.axes.find(row => row.parameter === 'maxAdditionalDistanceMetres')!;
  assert.equal(axis.witness.status, 'known');
  assert.equal(model.breakpoint.status, 'found');
  assert.deepEqual(model.breakpoint.beforeMetres, { status: 'known', value: 350000 });
  assert.deepEqual(model.breakpoint.afterMetres, { status: 'known', value: 354097 });
  assert.deepEqual(model.breakpoint.deltaMetres, { status: 'known', value: 4097 });
  assert.equal(model.breakpoint.beforeText, '350 km');
  assert.equal(model.breakpoint.afterText, '354.097 km');
  assert.equal(model.breakpoint.deltaText, '4.097 km');
  assert.equal(model.breakpoint.beforeCity, 'Nuremberg');
  assert.equal(model.breakpoint.afterCity, 'Frankfurt am Main');
  assert.equal(model.breakpoint.minimumProven, true);
  assert.equal(createLandingModel(recomputeResult(result, { maxAdditionalDistanceMetres: 354096 }, stamp)).recommendedCity, 'Nuremberg');
  assert.equal(createLandingModel(recomputeResult(result, { maxAdditionalDistanceMetres: 354097 }, stamp)).recommendedCity, 'Frankfurt am Main');
});

test('missing taste evidence stays UNKNOWN while the day-off fit stays N/A', () => {
  const base = createDemoResult(stamp);
  const replay = base.audit.replay;
  const audit = createDecisionAudit({ scenario: replay.scenario, candidateSet: replay.candidateSet.status === 'known' ? replay.candidateSet.value : undefined,
    policy: replay.policy, ranges: replay.ranges, queries: [], mode: 'demo', ...stamp });
  const model = createLandingModel({ ...base, audit });
  assert.deepEqual(model.options.map(option => option.fitText), ['UNKNOWN', 'UNKNOWN', 'N/A']);
  assert.equal(model.options[0]!.decisionStatus, 'UNKNOWN');
  assert.equal(model.options[0]!.note, 'More evidence needed');
  assert.equal(model.recommendedCity, 'UNKNOWN');
  assert.equal(model.proposedStop.status, 'unknown');
  assert.equal(model.breakpoint.afterMetres.status, 'unknown');
  assert.equal(model.breakpoint.afterText, 'UNKNOWN');
  assert.equal(model.breakpoint.afterCity, 'UNKNOWN');
});

test('an unchanged checked distance range cannot inherit the demo breakpoint', () => {
  const base = createDemoResult(stamp);
  const replay = base.audit.replay;
  const audit = createDecisionAudit({ scenario: replay.scenario,
    candidateSet: replay.candidateSet.status === 'known' ? replay.candidateSet.value : undefined,
    fitInput: replay.fitInput.status === 'known' ? replay.fitInput.value : undefined,
    policy: replay.policy,
    ranges: { ...replay.ranges, maxAdditionalDistanceMetres: { minimum: 350000, maximum: 350000 } },
    queries: base.audit.queries, mode: 'demo', ...stamp });
  const model = createLandingModel({ ...base, audit });
  assert.equal(model.breakpoint.status, 'not-found');
  assert.equal(model.breakpoint.rangeText, '350 km to 350 km');
  assert.equal(model.breakpoint.afterText, 'UNKNOWN');
  assert.equal(model.breakpoint.afterCity, 'UNKNOWN');
  assert.equal(model.breakpoint.deltaMetres.status, 'unknown');
  assert.throws(() => createLandingModel({ ...base, mode: 'live' }), /synthetic demo/);
});
