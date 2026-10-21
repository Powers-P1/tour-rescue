import assert from 'node:assert/strict';
import test from 'node:test';
import { createDecisionAudit } from '../src/core/audit.ts';
import { germanyDemoInputs, syntheticQueryEvidence } from '../src/demo/germany.ts';
import type { ApiDecisionResult } from '../worker/src/app.ts';
import { buildPromoterModel, groupPromoterChecks } from '../web/src/promoter-model.ts';

const generatedAt = '2026-10-21T12:34:56.000Z';
const inputs = germanyDemoInputs();

function result(overrides: Partial<Parameters<typeof createDecisionAudit>[0]> = {}): ApiDecisionResult {
  const audit = createDecisionAudit({
    ...inputs, candidateSet: inputs.fitInput.candidateSet, generatedAt, mode: 'demo', runId: 'promoter-sheet-test',
    queries: syntheticQueryEvidence([inputs.fitInput, inputs.controlFitInput], generatedAt), ...overrides,
  });
  return { schemaVersion: 'tour-rescue.api-result.v1', mode: audit.mode, scenarioId: audit.scenarioId, artists: inputs.artists, audit };
}

test('promoter model uses the selected audited option, real fixture deltas and exactly three comparison slots', () => {
  const model = buildPromoterModel(result(), 'replacement-nuremberg');
  assert.equal(model.artist, 'The Harbour Lights');
  assert.equal(model.city, 'Nuremberg');
  assert.equal(model.date, 'Sat, 14 November 2026');
  assert.equal(model.fit, '25');
  assert.equal(model.extraDistance, '+18.368 km');
  assert.equal(model.extraDriving, '+27 min 29 s');
  assert.equal(model.maximumDailyDriving, '4 h 40 min 34 s');
  assert.equal(model.dailyDrivingLimit, '6 h');
  assert.equal(model.distanceLimit, '350 km');
  assert.equal(model.venueFee, 'EUR 500');
  assert.equal(model.venueFeeLimit, 'EUR 1,000');
  assert.equal(model.comparisons.length, 3);
  assert.deepEqual(model.comparisons[2], { slot: 3, name: 'UNKNOWN - no artist supplied', status: 'unknown' });
  assert.match(model.sensitivityNote, /1\/2 omissions retain.*1 change/);
  assert.equal(model.decisionStatus, 'PASS');
  assert.match(model.recommendation, /^Recommended/);
  assert.match(model.venue, /Venue to confirm/);
  assert.match(model.provenanceNote, /no venue is confirmed/);
});

test('promoter sheet distinguishes an excluded preference from routing feasibility and never borrows the winner gate', () => {
  const response = result();
  assert.equal(response.audit.analysis.repairs.options.find(option => option.id === 'detour-frankfurt')?.status, 'PASS');
  const model = buildPromoterModel(response, 'detour-frankfurt');
  assert.equal(model.city, 'Frankfurt am Main');
  assert.equal(model.fit, '58.7');
  assert.equal(model.decisionStatus, 'FAIL');
  assert.equal(model.recommendation, 'Excluded by current checks');
  assert.match(model.recommendationNote, /does not certify this alternative/);
  assert.equal(model.checkGroups.find(group => group.id === 'distance')?.status, 'FAIL');
  assert.equal(model.checkCounts.FAIL, 1);
  assert.ok(model.risks.some(risk => /additional road distance exceeds/.test(risk)));
});

test('day-off promoter sheet has no invented fit, venue fee or city', () => {
  const model = buildPromoterModel(result(), 'day-off');
  assert.equal(model.fit, 'N/A');
  assert.equal(model.venueFee, 'N/A');
  assert.equal(model.city, 'Day off - no performance city');
  assert.equal(model.extraDistance, '0 km');
  assert.equal(model.extraDriving, '0 s');
  assert.match(model.venue, /no venue required/);
  assert.match(model.fitNote, /no cultural-fit score/);
  assert.equal(model.recommendation, 'Selected alternative - not recommended');
});

test('promoter retains synthetic provenance, original source time and evaluation time separately', () => {
  const model = buildPromoterModel(result(), 'replacement-nuremberg');
  assert.equal(model.modeLabel, 'DEMO - synthetic taste data');
  assert.match(model.sourceLines[0]!, /no Qloo request or acquisition timestamp/);
  assert.match(model.sourceLines[1]!, /OSRM: osrm-matrix-de-v1; osrm-table; recorded 2026-10-21T09:14:14\+00:00/);
  assert.equal(model.generatedAt, generatedAt);
  assert.equal(model.runId, 'promoter-sheet-test');
  assert.ok(model.risks.some(risk => /UNKNOWN: capacity and promoter agreement/.test(risk)));
  assert.ok(model.risks.some(risk => /Booking facts are fictional/.test(risk)));
  assert.ok(model.risks.some(risk => /sensitive to a comparison artist/.test(risk)));
});

test('promoter unknown travel stays unknown instead of presenting partial daily allocations as a complete route', () => {
  const scenario = structuredClone(inputs.scenario);
  const changed = { ...scenario, roadMatrix: { ...scenario.roadMatrix,
    legs: scenario.roadMatrix.legs.filter(leg => !(leg.fromCityId === 'de-berlin' && leg.toCityId === 'de-nuremberg')),
  } };
  const response = result({ scenario: changed });
  const model = buildPromoterModel(response, 'replacement-nuremberg');
  assert.equal(model.maximumDailyDriving, 'UNKNOWN');
  assert.equal(model.extraDistance, 'UNKNOWN');
  assert.equal(model.extraDriving, 'UNKNOWN');
  assert.equal(model.decisionStatus, 'UNKNOWN');
  assert.equal(model.recommendation, 'Evidence needed - not recommended');
  assert.ok(model.checkCounts.UNKNOWN > 0);
  assert.ok(model.risks.some(risk => /UNKNOWN/.test(risk)));
});

test('every decision check is represented exactly once in promoter groups with FAIL and UNKNOWN precedence', () => {
  const response = result();
  for (const option of response.audit.analysis.decision.options) {
    const model = buildPromoterModel(response, option.optionId);
    assert.deepEqual(model.checkGroups.flatMap(group => group.checkIds).sort(), option.checks.map(check => check.id).sort());
    assert.equal(model.checkGroups.reduce((total, group) => total + group.checkIds.length, 0), model.checkCount);
    assert.equal(model.checkCounts.PASS + model.checkCounts.FAIL + model.checkCounts.UNKNOWN, model.checkCount);
  }
  const checks = [
    { id: 'travel:a:daily-driving', status: 'PASS' as const, message: '', evidence: {} },
    { id: 'travel:b:daily-driving', status: 'UNKNOWN' as const, message: '', evidence: {} },
  ];
  assert.equal(groupPromoterChecks(checks)[0]?.status, 'UNKNOWN');
  assert.equal(groupPromoterChecks([...checks, { id: 'travel:c:daily-driving', status: 'FAIL', message: '', evidence: {} }])[0]?.status, 'FAIL');
});

test('missing live fit and acquisition evidence remain explicit on the promoter sheet', () => {
  const queries = syntheticQueryEvidence([inputs.fitInput], generatedAt).map(query => ({
    ...query, source: 'live' as const, status: 'failed' as const,
    httpStatus: { status: 'known' as const, value: 429 },
    warnings: [],
  }));
  const response = result({ fitInput: undefined, controlFitInput: undefined, mode: 'live', queries });
  const model = buildPromoterModel(response, 'replacement-nuremberg');
  assert.equal(model.fit, 'UNKNOWN');
  assert.equal(model.decisionStatus, 'UNKNOWN');
  assert.match(model.sensitivityNote, /UNKNOWN/);
  assert.match(model.sourceLines[0]!, /Acquired: UNKNOWN/);
  assert.match(model.sourceLines[0]!, /3 query records \(3 failed\)/);
  assert.match(model.sourceLines[0]!, /fit UNKNOWN; no usable fit index/);
  assert.doesNotMatch(model.sourceLines[0]!, /derived within-query percentiles/);
  assert.equal(model.modeLabel, 'LIVE RUN - Qloo fit UNKNOWN');
});

test('infeasible baseline keeps the core leave-one-out reason even when comparison artists are present', () => {
  const scenario = { ...inputs.scenario, tour: { ...inputs.scenario.tour,
    constraints: { ...inputs.scenario.tour.constraints, maxDailyDrivingSeconds: 1 },
  } };
  const response = result({ scenario });
  assert.equal(response.audit.analysis.decision.recommendation.status, 'no-feasible-option');
  assert.equal(response.audit.analysis.artistSensitivity.status, 'not-applicable');
  assert.equal(response.artists.comparisons.length, 2);
  const model = buildPromoterModel(response, 'replacement-nuremberg');
  assert.match(model.sensitivityNote, /not applicable.*no baseline recommendation/);
  assert.doesNotMatch(model.sensitivityNote, /no comparison artist/i);
});

test('promoter rejects an option from a different audit instead of exporting a fallback', () => {
  assert.throws(() => buildPromoterModel(result(), 'unrelated-option'), /Select an option from the current audit/);
});
