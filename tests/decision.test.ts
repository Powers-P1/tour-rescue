import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDecisionPolicy, PolicyInputError, recommendRepair } from '../src/core/decision.ts';
import type { DecisionPolicy } from '../src/core/decision-types.ts';
import { evaluateRepairOptions } from '../src/core/repair-options.ts';
import type { EvaluatedRepairOption, RepairReport } from '../src/core/repair-types.ts';
import { parseSyntheticHeatmapFitInput } from '../src/core/scenario-fit.ts';
import type { CheckStatus } from '../src/core/travel-constraints.ts';
import { fixture, freezeDeep, germanyScenario } from './helpers/scenarios.ts';
import type { Mutable } from './helpers/scenarios.ts';

const policy = (minimumFitIndex = 50, maxAdditionalDistanceMetres = 400000): DecisionPolicy => ({
  schemaVersion: 'tour-rescue.decision-policy.v1', minimumFitIndex, maxAdditionalDistanceMetres,
});
const baseline = evaluateRepairOptions(germanyScenario(),
  parseSyntheticHeatmapFitInput(fixture('qloo/heatmap_de_synthetic.json')));
freezeDeep(baseline);
const input = (): Mutable<RepairReport> => structuredClone(baseline) as Mutable<RepairReport>;
const candidate = (report: Mutable<RepairReport>, kind: string): Mutable<EvaluatedRepairOption> => {
  const found = report.options.find(option => option.kind === kind);
  assert.ok(found);
  return found;
};
function hardStatus(option: Mutable<EvaluatedRepairOption>, status: CheckStatus): void {
  option.status = status;
  option.routingStatus = status;
  option.venueStatus = 'PASS';
  option.checks.push({ id: `test:hard-status:${status}`, status, message: 'Explicit synthetic test evidence.', evidence: {} });
}
function fit(option: Mutable<EvaluatedRepairOption>, value: number): void {
  option.fit = { status: 'known', value };
}
function distance(option: Mutable<EvaluatedRepairOption>, value: number): void {
  option.additionalDistanceMetres = { status: 'known', value };
}

test('Germany scenario recommends Frankfurt under explicit fit and travel preferences', () => {
  const result = recommendRepair(baseline, policy());
  assert.equal(result.recommendation.status, 'recommended');
  if (result.recommendation.status !== 'recommended') assert.fail('Expected a recommendation.');
  assert.equal(result.recommendation.optionId, 'detour-frankfurt');
  assert.equal(result.recommendation.kind, 'detour');
  assert.equal(result.tieBreak, 'fit');
  assert.deepEqual(result.rankedShowOptionIds, ['detour-frankfurt']);
  assert.deepEqual(result.options.map(option => option.status), ['FAIL', 'PASS', 'PASS']);
  assert.equal(result.options[0]?.checks.find(check => check.id === 'decision:minimum-fit')?.status, 'FAIL');
});

test('a declared travel cap changes eligibility without folding kilometres into the fit index', () => {
  const report = input();
  fit(candidate(report, 'replacement'), 70);
  fit(candidate(report, 'detour'), 80);
  distance(candidate(report, 'replacement'), 20000);
  distance(candidate(report, 'detour'), 300000);
  const wide = recommendRepair(report, policy(50, 400000));
  const narrow = recommendRepair(report, policy(50, 200000));
  assert.equal(wide.recommendation.status === 'recommended' && wide.recommendation.optionId, 'detour-frankfurt');
  assert.equal(narrow.recommendation.status === 'recommended' && narrow.recommendation.optionId, 'replacement-nuremberg');
  assert.deepEqual(candidate(report, 'detour').fit, { status: 'known', value: 80 });
});

test('exact fit-floor and metre-cap equality pass while the next integer step excludes', () => {
  const report = input();
  const replacement = candidate(report, 'replacement');
  fit(replacement, 50);
  distance(replacement, 100000);
  hardStatus(candidate(report, 'detour'), 'FAIL');
  const equal = recommendRepair(report, policy(50, 100000));
  assert.equal(equal.recommendation.status === 'recommended' && equal.recommendation.optionId, replacement.id);
  const higherFitFloor = recommendRepair(report, policy(51, 100000));
  assert.equal(higherFitFloor.recommendation.status === 'recommended'
    && higherFitFloor.recommendation.kind, 'day-off');
  const lessDistance = recommendRepair(report, policy(50, 99999));
  assert.equal(lessDistance.recommendation.status === 'recommended' && lessDistance.recommendation.kind, 'day-off');
  fit(replacement, 49.999999999999);
  const below = recommendRepair(report, policy(50, 100000));
  assert.equal(below.options[0]?.status, 'FAIL', 'display rounding must not promote a score across the threshold');
});

test('equal fit prefers lower signed additional distance, including negative deltas', () => {
  const report = input();
  fit(candidate(report, 'replacement'), 80);
  fit(candidate(report, 'detour'), 80);
  distance(candidate(report, 'replacement'), -10);
  distance(candidate(report, 'detour'), 0);
  const result = recommendRepair(report, policy(50, 0));
  assert.equal(result.recommendation.status === 'recommended' && result.recommendation.optionId, 'replacement-nuremberg');
  assert.equal(result.tieBreak, 'additional-distance');
});

test('a complete tie uses explicit Unicode code-point ID order, independent of option input order', () => {
  const report = input();
  const replacement = candidate(report, 'replacement');
  const detour = candidate(report, 'detour');
  fit(replacement, 80); fit(detour, 80);
  distance(replacement, 1000); distance(detour, 1000);
  replacement.id = '\u{10000}';
  detour.id = '\ue000';
  const result = recommendRepair(report, policy());
  assert.equal(result.recommendation.status === 'recommended' && result.recommendation.optionId, '\ue000');
  assert.equal(result.tieBreak, 'option-id');
  assert.match(result.recommendation.reason, /no inferred quality advantage/);
  report.options.reverse();
  assert.deepEqual(recommendRepair(report, policy()), result);
});

test('otherwise viable UNKNOWN evidence blocks a winner even when another show passes', () => {
  for (const missing of ['road', 'fit', 'distance'] as const) {
    const report = input();
    const replacement = candidate(report, 'replacement');
    fit(replacement, 80);
    if (missing === 'road') hardStatus(replacement, 'UNKNOWN');
    if (missing === 'fit') replacement.fit = { status: 'unknown', reason: 'Missing comparable profile.' };
    if (missing === 'distance') replacement.additionalDistanceMetres = { status: 'unknown', reason: 'Missing baseline road leg.' };
    const result = recommendRepair(report, policy());
    assert.equal(result.recommendation.status, 'needs-evidence', missing);
    assert.equal(result.tieBreak, 'not-applicable');
    assert.deepEqual(result.rankedShowOptionIds, ['detour-frankfurt']);
  }
});

test('a proven exclusion dominates unrelated UNKNOWN evidence and does not block another show', () => {
  for (const exclusion of ['hard', 'fit', 'distance'] as const) {
    const report = input();
    const replacement = candidate(report, 'replacement');
    if (exclusion === 'hard') {
      hardStatus(replacement, 'FAIL');
      replacement.fit = { status: 'unknown', reason: 'Unneeded missing fit for an impossible route.' };
    } else {
      hardStatus(replacement, 'UNKNOWN');
      if (exclusion === 'fit') fit(replacement, 49);
      else { fit(replacement, 80); distance(replacement, 400001); }
    }
    const result = recommendRepair(report, policy());
    assert.equal(result.options[0]?.status, 'FAIL', exclusion);
    assert.ok(result.options[0]?.checks.some(check => check.status === 'UNKNOWN'));
    assert.equal(result.recommendation.status === 'recommended' && result.recommendation.optionId, 'detour-frankfurt');
  }
});

test('day-off fallback requires both shows to be definitively excluded and adds no fake fit score', () => {
  const result = recommendRepair(baseline, policy(60));
  assert.equal(result.recommendation.status === 'recommended' && result.recommendation.kind, 'day-off');
  assert.equal(result.tieBreak, 'day-off');
  assert.deepEqual(result.rankedShowOptionIds, []);
  const dayOff = result.options.find(option => option.kind === 'day-off')!;
  assert.ok(dayOff.checks.every(check => !check.id.startsWith('decision:')));
  assert.equal(baseline.options.find(option => option.kind === 'day-off')?.fit.status, 'unknown');
});

test('unknown or failed day-off feasibility is distinguished when fallback is needed', () => {
  for (const status of ['UNKNOWN', 'FAIL'] as const) {
    const report = input();
    hardStatus(candidate(report, 'day-off'), status);
    const result = recommendRepair(report, policy(60));
    assert.equal(result.recommendation.status, status === 'UNKNOWN' ? 'needs-evidence' : 'no-feasible-option');
    assert.equal(result.tieBreak, 'not-applicable');
  }
});

test('a failed day-off option does not veto an independently passing show option', () => {
  const report = input();
  hardStatus(candidate(report, 'day-off'), 'FAIL');
  const result = recommendRepair(report, policy());
  assert.equal(result.recommendation.status === 'recommended' && result.recommendation.optionId, 'detour-frankfurt');
  assert.equal(result.options.find(option => option.kind === 'day-off')?.status, 'FAIL');
});

test('policy thresholds are explicit discrete bounds, with no implicit defaults or numeric coercion', () => {
  for (const value of [undefined, null, [], {}, { ...policy(), schemaVersion: 'unknown-version' }]) {
    assert.throws(() => parseDecisionPolicy(value), PolicyInputError);
  }
  for (const value of [-1, 101, 0.1, NaN, Infinity, '50', undefined]) {
    assert.throws(() => parseDecisionPolicy({ ...policy(), minimumFitIndex: value }), /minimumFitIndex/);
  }
  for (const value of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '400000', undefined]) {
    assert.throws(() => parseDecisionPolicy({ ...policy(), maxAdditionalDistanceMetres: value }), /maxAdditionalDistanceMetres/);
  }
  assert.deepEqual(parseDecisionPolicy(policy(0, 0)), policy(0, 0));
  assert.deepEqual(parseDecisionPolicy(policy(100, Number.MAX_SAFE_INTEGER)), policy(100, Number.MAX_SAFE_INTEGER));
});

test('core-report consistency rejects duplicated options and a forged passing status', () => {
  const duplicate = input();
  duplicate.options[1]!.id = duplicate.options[0]!.id;
  assert.throws(() => recommendRepair(duplicate, policy()), /unique/);
  const kinds = input();
  kinds.options[1]!.kind = kinds.options[0]!.kind;
  assert.throws(() => recommendRepair(kinds, policy()), /unique/);
  const forged = input();
  candidate(forged, 'replacement').checks.push({ id: 'test:failed', status: 'FAIL', message: 'Failure.', evidence: {} });
  assert.throws(() => recommendRepair(forged, policy()), /inconsistent/);
  const sparse = input();
  delete sparse.options[0];
  assert.throws(() => recommendRepair(sparse, policy()), /present and unique/);
});

test('malformed known numeric evidence is rejected instead of entering the recommendation ordering', () => {
  for (const value of [-1, 101, NaN, Infinity]) {
    const report = input();
    fit(candidate(report, 'replacement'), value);
    assert.throws(() => recommendRepair(report, policy()), /fit index/);
  }
  const report = input();
  distance(candidate(report, 'replacement'), Number.MAX_SAFE_INTEGER + 1);
  assert.throws(() => recommendRepair(report, policy()), /safe-integer metre/);
});

test('recommendation is reproducible and preserves frozen feasibility reports and policy inputs', () => {
  const preferences = policy();
  const snapshot = structuredClone(baseline);
  freezeDeep(preferences);
  const result = recommendRepair(baseline, preferences);
  assert.deepEqual(recommendRepair(baseline, preferences), result);
  assert.deepEqual(baseline, snapshot);
  assert.deepEqual(result.policy, preferences);
});
