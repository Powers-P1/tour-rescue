import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeTourDecision, evaluateTourDecision, parseSyntheticHeatmapFitInput,
} from '../src/core/index.ts';
import type { BreakpointRanges, DecisionPolicy, NumericBreakpointAxis, TourDecisionAnalysis } from '../src/core/index.ts';
import { fixture, freezeDeep, germanyScenario, polishScenario } from './helpers/scenarios.ts';
import type { Mutable } from './helpers/scenarios.ts';

function example(): { policy: DecisionPolicy; ranges: BreakpointRanges; expected: Record<string, string | number> } {
  return fixture('synthetic/decision__germany__policy.json') as ReturnType<typeof example>;
}
const fitInput = () => parseSyntheticHeatmapFitInput(fixture('qloo/heatmap_de_synthetic.json'));
function axis(analysis: TourDecisionAnalysis, parameter: string): NumericBreakpointAxis {
  const result = analysis.breakpoints.axes.find(item => item.parameter === parameter);
  assert.ok(result);
  return result;
}

test('Germany policy example reproduces a recommendation and three separate single-change witnesses', () => {
  const { policy, ranges, expected } = example();
  const analysis = analyzeTourDecision(germanyScenario(), fitInput(), policy, ranges);
  const recommendation = analysis.decision.recommendation;
  assert.equal(recommendation.status, 'recommended');
  if (recommendation.status !== 'recommended') assert.fail('Expected a baseline recommendation.');
  assert.equal(recommendation.optionId, expected.recommendedOptionId);
  assert.deepEqual(analysis.breakpoints.baseline, analysis.decision);
  const cases = [
    ['maxAdditionalDistanceMetres', expected.distanceBreakpointMetres, expected.distanceNextOptionId],
    ['minimumFitIndex', expected.fitFloorBreakpoint, expected.fitFloorNextOptionId],
    ['additionalBudgetMinorUnits', expected.venueBudgetBreakpointMinorUnits, expected.venueBudgetNextOptionId],
  ] as const;
  for (const [parameter, nextValue, nextOption] of cases) {
    const result = axis(analysis, parameter);
    assert.equal(result.status, 'found', parameter);
    assert.equal(result.minimality, 'proven-within-range', parameter);
    assert.equal(result.witness.status, 'known');
    if (result.witness.status !== 'known') assert.fail('Expected an explicit numeric witness.');
    assert.equal(result.witness.value.after, nextValue);
    const after = result.witness.value.decision.recommendation;
    assert.equal(after.status, 'recommended');
    if (after.status !== 'recommended') assert.fail('Expected another known recommendation.');
    assert.equal(after.optionId, nextOption);
    assert.equal(result.witness.value.decision.options.find(item => item.optionId === after.optionId)?.status, 'PASS');
  }
  const distance = axis(analysis, 'maxAdditionalDistanceMetres');
  if (distance.witness.status !== 'known') assert.fail('Expected distance witness.');
  assert.equal(distance.witness.value.delta, expected.distanceChangeMetres);
  assert.deepEqual(axis(analysis, 'additionalBudgetMinorUnits').currency, { status: 'known', value: 'EUR' });
});

test('artist omissions change only fit evidence and never unlock commitments or reapply 50/50', () => {
  const { policy, ranges } = example();
  const scenario = germanyScenario();
  const analysis = analyzeTourDecision(scenario, fitInput(), policy, ranges);
  const sensitivity = analysis.artistSensitivity;
  assert.equal(sensitivity.status, 'complete');
  assert.equal(sensitivity.scope, 'comparison-artists-only');
  assert.equal(sensitivity.runs.length, 2);
  assert.deepEqual(sensitivity.runs.map(run => run.outcome).sort(), ['option-changed', 'retained']);
  assert.deepEqual(sensitivity.summary, {
    totalRuns: 2, comparableRuns: 2, retainedRuns: 1, changedOptionRuns: 1, withdrawnRuns: 0,
    unresolvedRuns: 0, notComparableRuns: 0,
    retainedRecommendationFraction: { status: 'known', value: 0.5 },
  });
  for (const run of sensitivity.runs) {
    assert.deepEqual(run.retainedWeights.map(row => row.after).sort(), [1 / 3, 2 / 3]);
    assert.deepEqual(run.fitReport.candidateSet, analysis.repairs.fitReport.status === 'known'
      ? analysis.repairs.fitReport.value.candidateSet : assert.fail('Expected fit report.'));
    for (const original of analysis.repairs.options) {
      const evaluated = run.decision.options.find(option => option.optionId === original.id)!;
      assert.deepEqual(evaluated.checks.slice(0, original.checks.length), original.checks);
    }
  }
});

test('a recovered decision after omitting incomplete evidence is not reported as a known baseline flip', () => {
  const { policy, ranges } = example();
  const input = structuredClone(fitInput()) as Mutable<ReturnType<typeof fitInput>>;
  input.profiles[2]!.observations[0]!.affinity = { status: 'unknown', reason: 'No synthetic evidence for this city.' };
  const analysis = analyzeTourDecision(germanyScenario(), input, policy, ranges);
  assert.equal(analysis.decision.recommendation.status, 'needs-evidence');
  assert.ok(analysis.breakpoints.axes.every(result => result.status === 'unknown'));
  assert.equal(analysis.artistSensitivity.status, 'unknown');
  assert.ok(analysis.artistSensitivity.runs.some(run => run.decision.recommendation.status === 'recommended'));
  assert.ok(analysis.artistSensitivity.runs.every(run => run.outcome === 'not-comparable'));
  assert.equal(analysis.artistSensitivity.summary.comparableRuns, 0);
  assert.equal(analysis.artistSensitivity.summary.retainedRecommendationFraction.status, 'unknown');
});

test('absent profiles and unverified original PR1 fixture remain explicitly unresolved', () => {
  const { policy, ranges } = example();
  const analysis = analyzeTourDecision(polishScenario(), undefined, policy, ranges);
  assert.equal(analysis.decision.recommendation.status, 'needs-evidence');
  assert.ok(analysis.breakpoints.axes.every(result => result.status === 'unknown'));
  assert.equal(analysis.artistSensitivity.status, 'unknown');
  assert.deepEqual(analysis.artistSensitivity.runs, []);
  assert.equal(analysis.artistSensitivity.summary.retainedRecommendationFraction.status, 'unknown');
});

test('target-only input has no comparison omission runs and no invented perfect stability', () => {
  const { policy, ranges } = example();
  const input = structuredClone(fitInput()) as Mutable<ReturnType<typeof fitInput>>;
  input.profiles = input.profiles.filter(profile => profile.role === 'target');
  input.profiles[0]!.weight = 1;
  const analysis = analyzeTourDecision(germanyScenario(), input, policy, ranges);
  assert.equal(analysis.artistSensitivity.status, 'not-applicable');
  assert.equal(analysis.artistSensitivity.runs.length, 0);
  assert.equal(analysis.artistSensitivity.summary.retainedRecommendationFraction.status, 'unknown');
});

test('baseline wrapper keeps arbitrary counterfactual weights outside the 50/50 scenario entry', () => {
  const { policy } = example();
  const input = structuredClone(fitInput()) as Mutable<ReturnType<typeof fitInput>>;
  input.profiles[0]!.weight = 0.7;
  input.profiles[1]!.weight = 0.2;
  input.profiles[2]!.weight = 0.1;
  assert.throws(() => evaluateTourDecision(germanyScenario(), input, policy), /weight/);
});

test('complete analysis is reproducible JSON and leaves frozen input and baseline commitments untouched', () => {
  const scenario = germanyScenario();
  const fit = fitInput();
  const { policy, ranges } = example();
  const snapshot = structuredClone({ scenario, fit, policy, ranges });
  [scenario, fit, policy, ranges].forEach(freezeDeep);
  const analysis = analyzeTourDecision(scenario, fit, policy, ranges);
  assert.deepEqual(JSON.parse(JSON.stringify(analysis)), analysis);
  assert.deepEqual(analyzeTourDecision(scenario, fit, policy, ranges), analysis);
  assert.deepEqual({ scenario, fit, policy, ranges }, snapshot);
  for (const repair of analysis.repairs.options) {
    assert.deepEqual(repair.route.filter(stop => stop.status === 'confirmed'),
      scenario.tour.shows.filter(show => show.status === 'confirmed'));
  }
});
