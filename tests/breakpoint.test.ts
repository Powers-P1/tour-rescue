import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeNumericBreakpoints, BreakpointInputError, parseBreakpointRanges,
} from '../src/core/breakpoint.ts';
import type {
  BreakpointRanges, NumericBreakpointAxis, NumericBreakpointParameter, NumericBreakpointReport,
  NumericBreakpointWitness,
} from '../src/core/breakpoint.ts';
import type { DecisionPolicy } from '../src/core/decision-types.ts';
import { recommendRepair } from '../src/core/decision.ts';
import { evaluateRepairOptions } from '../src/core/repair-options.ts';
import { parseSyntheticHeatmapFitInput } from '../src/core/scenario-fit.ts';
import { fixture, freezeDeep, germanyScenario, polishScenario } from './helpers/scenarios.ts';
import type { Mutable } from './helpers/scenarios.ts';

const fitInput = () => parseSyntheticHeatmapFitInput(fixture('qloo/heatmap_de_synthetic.json'));
const policy = (overrides: Partial<DecisionPolicy> = {}): DecisionPolicy => ({
  schemaVersion: 'tour-rescue.decision-policy.v1', minimumFitIndex: 20,
  maxAdditionalDistanceMetres: 350000, ...overrides,
});
const ranges = (overrides: Partial<BreakpointRanges> = {}): BreakpointRanges => ({
  schemaVersion: 'tour-rescue.breakpoint-ranges.v1',
  maxAdditionalDistanceMetres: { minimum: 0, maximum: 500000 },
  minimumFitIndex: { minimum: 0, maximum: 100 },
  additionalBudgetMinorUnits: { minimum: 0, maximum: 100000 },
  ...overrides,
});
function axis(report: NumericBreakpointReport, parameter: NumericBreakpointParameter): NumericBreakpointAxis {
  const result = report.axes.find(item => item.parameter === parameter);
  assert.ok(result);
  return result;
}
function witness(result: NumericBreakpointAxis): NumericBreakpointWitness {
  assert.equal(result.status, 'found');
  assert.ok(result.witness.status === 'known');
  return result.witness.value;
}

test('Germany breakpoints expose separate exact one-parameter witnesses rather than mixing units', () => {
  const result = analyzeNumericBreakpoints(germanyScenario(), fitInput(), policy(), ranges());
  assert.equal(result.baseline.recommendation.status, 'recommended');
  if (result.baseline.recommendation.status !== 'recommended') assert.fail('Expected baseline recommendation.');
  assert.equal(result.baseline.recommendation.optionId, 'replacement-nuremberg');
  const distance = axis(result, 'maxAdditionalDistanceMetres');
  assert.deepEqual([witness(distance).before, witness(distance).after, witness(distance).delta], [350000, 354097, 4097]);
  assert.equal(witness(distance).decision.recommendation.status, 'recommended');
  if (witness(distance).decision.recommendation.status === 'recommended') {
    const recommendation = witness(distance).decision.recommendation;
    assert.ok(recommendation.status === 'recommended');
    assert.equal(recommendation.optionId, 'detour-frankfurt');
  }
  assert.equal(distance.minimality, 'proven-within-range');
  const fit = axis(result, 'minimumFitIndex');
  assert.equal(witness(fit).after, 26);
  assert.equal(witness(fit).delta, 6);
  assert.equal(fit.unit, 'fit-index-points');
  assert.equal(fit.resolution, 1);
  const budget = axis(result, 'additionalBudgetMinorUnits');
  assert.equal(witness(budget).after, 49999);
  assert.deepEqual(budget.currency, { status: 'known', value: 'EUR' });
  assert.equal(budget.unit, 'minor-currency-units');
  assert.equal(result.method, 'exact-critical-values-v1');
});

test('inclusive distance cap changes at the exact metre boundary and includes a bounded endpoint', () => {
  const result = analyzeNumericBreakpoints(germanyScenario(), fitInput(), policy({ maxAdditionalDistanceMetres: 354096 }),
    ranges({ maxAdditionalDistanceMetres: { minimum: 354095, maximum: 354097 } }));
  const found = witness(axis(result, 'maxAdditionalDistanceMetres'));
  assert.equal(found.after, 354097);
  assert.equal(found.delta, 1);
  const repair = evaluateRepairOptions(germanyScenario(), fitInput());
  for (const value of [354095, 354096, 354097]) {
    const actual = recommendRepair(repair, policy({ maxAdditionalDistanceMetres: value })).recommendation;
    assert.ok(actual.status === 'recommended');
    assert.equal(actual.optionId, value === 354097 ? 'detour-frankfurt' : 'replacement-nuremberg');
  }
});

test('integer fit floor never invents a continuous epsilon minimum around fractional percentiles', () => {
  const result = analyzeNumericBreakpoints(germanyScenario(), fitInput(),
    policy({ minimumFitIndex: 59, maxAdditionalDistanceMetres: 400000 }), ranges());
  const fit = axis(result, 'minimumFitIndex');
  assert.equal(result.baseline.recommendation.status, 'recommended');
  assert.equal(witness(fit).before, 59);
  assert.equal(witness(fit).after, 58);
  assert.equal(witness(fit).delta, -1);
  assert.equal(witness(fit).decision.recommendation.status, 'recommended');
  assert.ok(fit.checkedValues.every(sample => Number.isInteger(sample.value)));
});

test('venue budget searches exact minor units and can switch from the expensive show to the cheaper one', () => {
  const scenario = germanyScenario();
  scenario.tour.constraints.additionalBudget = { status: 'known', value: { currency: 'EUR', minorUnits: 80000 } };
  scenario.venues.find(venue => venue.id === 'venue-de-frankfurt')!.fee = {
    status: 'known', value: { currency: 'EUR', minorUnits: 70000 },
  };
  const result = analyzeNumericBreakpoints(scenario, fitInput(), policy({ maxAdditionalDistanceMetres: 400000 }), ranges());
  const found = witness(axis(result, 'additionalBudgetMinorUnits'));
  assert.deepEqual([found.before, found.after, found.delta], [80000, 69999, -10001]);
  const recommendation = found.decision.recommendation;
  assert.ok(recommendation.status === 'recommended');
  assert.equal(recommendation.optionId, 'replacement-nuremberg');
  const atQuote = axis(result, 'additionalBudgetMinorUnits').checkedValues.find(sample => sample.value === 70000)!;
  assert.ok(atQuote.recommendation.status === 'recommended');
  assert.equal(atQuote.recommendation.optionId, 'detour-frankfurt');
});

test('a complete no-change result names only the explicit checked range, including threshold equality', () => {
  const bounded = ranges({
    maxAdditionalDistanceMetres: { minimum: 350000, maximum: 354096 },
    minimumFitIndex: { minimum: 20, maximum: 25 },
    additionalBudgetMinorUnits: { minimum: 50000, maximum: 100000 },
  });
  const result = analyzeNumericBreakpoints(germanyScenario(), fitInput(), policy(), bounded);
  for (const item of result.axes) {
    assert.equal(item.status, 'not-found');
    assert.equal(item.reason, 'No decision change found in the checked range.');
    assert.deepEqual(item.range, bounded[item.parameter]);
    assert.ok(item.checkedValues.some(sample => sample.value === item.range.minimum));
    assert.ok(item.checkedValues.some(sample => sample.value === item.range.maximum));
    assert.equal(item.witness.status, 'unknown');
  }
});

test('equally distant reversals use the lower counterfactual value deterministically', () => {
  const result = analyzeNumericBreakpoints(germanyScenario(), fitInput(), policy({ maxAdditionalDistanceMetres: 186232 }), ranges());
  const found = witness(axis(result, 'maxAdditionalDistanceMetres'));
  assert.equal(Math.abs(18367 - 186232), Math.abs(354097 - 186232));
  assert.equal(found.after, 18367);
});

test('large explicit ranges use finitely many exact critical values, not a metre-by-metre scan', () => {
  const result = analyzeNumericBreakpoints(germanyScenario(), fitInput(), policy(), ranges({
    maxAdditionalDistanceMetres: { minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    additionalBudgetMinorUnits: { minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  }));
  assert.equal(witness(axis(result, 'maxAdditionalDistanceMetres')).after, 354097);
  assert.ok(result.axes.every(item => item.checkedValues.length <= 7));
});

test('an unresolved baseline is UNKNOWN, never a successful reversal or a none-found certificate', () => {
  const result = analyzeNumericBreakpoints(polishScenario(), undefined, policy(), ranges());
  assert.equal(result.baseline.recommendation.status, 'needs-evidence');
  assert.ok(result.axes.every(item => item.status === 'unknown'));
  assert.ok(result.axes.every(item => item.witness.status === 'unknown'));
});

test('a known absence of a baseline recommendation is explicitly not applicable', () => {
  const scenario = germanyScenario();
  scenario.tour.constraints.maxDailyDrivingSeconds = 1;
  const result = analyzeNumericBreakpoints(scenario, fitInput(), policy(), ranges());
  assert.equal(result.baseline.recommendation.status, 'no-feasible-option');
  assert.ok(result.axes.every(item => item.status === 'not-applicable'));
});

test('a witnessed loss of every feasible choice is labelled recommendation-withdrawn, not another booked show', () => {
  const scenario = germanyScenario();
  // Deliberate non-metric mock: the direct day-off leg fails, the two-leg replacement still fits.
  const direct = scenario.roadMatrix.legs.find(leg => leg.fromCityId === 'de-berlin' && leg.toCityId === 'de-munich')!;
  assert.ok(direct.travel.status === 'known');
  direct.travel.value.durationSeconds = 200000;
  const result = analyzeNumericBreakpoints(scenario, fitInput(), policy(), ranges());
  assert.equal(result.baseline.recommendation.status, 'recommended');
  const found = witness(axis(result, 'additionalBudgetMinorUnits'));
  assert.equal(found.after, 49999);
  assert.equal(found.flip, 'recommendation-withdrawn');
  assert.equal(found.decision.recommendation.status, 'no-feasible-option');
});

test('unknown budget remains an unknown axis even when known policy failures allow day off', () => {
  const scenario = germanyScenario();
  scenario.tour.constraints.additionalBudget = { status: 'unknown', reason: 'No ceiling supplied.' };
  const result = analyzeNumericBreakpoints(scenario, fitInput(), policy({ minimumFitIndex: 100 }), ranges());
  assert.equal(result.baseline.recommendation.status, 'recommended');
  const budget = axis(result, 'additionalBudgetMinorUnits');
  assert.equal(budget.status, 'unknown');
  assert.deepEqual(budget.baselineValue, { status: 'unknown', reason: 'No ceiling supplied.' });
  assert.deepEqual(budget.checkedValues, []);
});

test('unknown counterfactuals cannot be reported as either a flip or a complete no-change range', () => {
  const scenario = germanyScenario();
  scenario.venues.find(venue => venue.id === 'venue-de-frankfurt')!.availability = {
    status: 'unknown', reason: 'Frankfurt booking not supplied.',
  };
  const result = analyzeNumericBreakpoints(scenario, fitInput(), policy(), ranges({
    maxAdditionalDistanceMetres: { minimum: 350000, maximum: 400000 },
  }));
  const distance = axis(result, 'maxAdditionalDistanceMetres');
  assert.equal(distance.status, 'unknown');
  assert.equal(distance.witness.status, 'unknown');
  assert.ok(distance.checkedValues.some(sample => sample.recommendation.status === 'needs-evidence'));
});

test('a known witnessed reversal survives but cannot claim minimality across closer unknowns', () => {
  const scenario = germanyScenario();
  scenario.venues.find(venue => venue.id === 'venue-de-frankfurt')!.availability = {
    status: 'unknown', reason: 'Frankfurt booking not supplied.',
  };
  const result = analyzeNumericBreakpoints(scenario, fitInput(), policy(), ranges());
  const distance = axis(result, 'maxAdditionalDistanceMetres');
  assert.equal(witness(distance).after, 18367);
  assert.equal(distance.minimality, 'unknown');
  assert.match(distance.reason, /unresolved closer/);
});

test('currency mismatch is not converted into a budget breakpoint', () => {
  const scenario = germanyScenario();
  scenario.venues.find(venue => venue.id === 'venue-de-frankfurt')!.fee = {
    status: 'known', value: { currency: 'USD', minorUnits: 43210 },
  };
  const result = analyzeNumericBreakpoints(scenario, fitInput(), policy(), ranges());
  const budget = axis(result, 'additionalBudgetMinorUnits');
  assert.ok(budget.checkedValues.every(sample => sample.value !== 43210 && sample.value !== 43209));
  assert.equal(witness(budget).after, 49999);
  assert.deepEqual(budget.currency, { status: 'known', value: 'EUR' });
});

test('range validation rejects coercion, fractional domains, missing axes and out-of-range baselines', () => {
  for (const invalid of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.throws(() => parseBreakpointRanges({ ...ranges(), maxAdditionalDistanceMetres: { minimum: invalid, maximum: 500000 } }), BreakpointInputError);
  }
  assert.throws(() => parseBreakpointRanges({ ...ranges(), minimumFitIndex: { minimum: 0, maximum: 101 } }), BreakpointInputError);
  assert.throws(() => parseBreakpointRanges({ ...ranges(), minimumFitIndex: { minimum: 60, maximum: 50 } }), BreakpointInputError);
  const missing = { ...ranges() } as Record<string, unknown>;
  delete missing.additionalBudgetMinorUnits;
  assert.throws(() => parseBreakpointRanges(missing), BreakpointInputError);
  assert.throws(() => parseBreakpointRanges({ ...ranges(), step: 1000 }), BreakpointInputError);
  assert.throws(() => analyzeNumericBreakpoints(germanyScenario(), fitInput(), policy(), ranges({
    maxAdditionalDistanceMetres: { minimum: 350001, maximum: 500000 },
  })), /include the known baseline/);
});

test('single-point ranges report no change and frozen inputs are unchanged across deterministic runs', () => {
  const scenario = germanyScenario();
  const fit = fitInput();
  const thresholds = policy();
  const bounds = ranges({
    maxAdditionalDistanceMetres: { minimum: 350000, maximum: 350000 },
    minimumFitIndex: { minimum: 20, maximum: 20 },
    additionalBudgetMinorUnits: { minimum: 100000, maximum: 100000 },
  });
  const before = structuredClone({ scenario, fit, thresholds, bounds });
  freezeDeep(scenario); freezeDeep(fit); freezeDeep(thresholds); freezeDeep(bounds);
  const result = analyzeNumericBreakpoints(scenario, fit, thresholds, bounds);
  assert.ok(result.axes.every(item => item.status === 'not-found' && item.checkedValues.length === 1));
  assert.deepEqual(analyzeNumericBreakpoints(scenario, fit, thresholds, bounds), result);
  assert.deepEqual({ scenario, fit, thresholds, bounds }, before);
});

test('missing artist evidence is never repaired by the numeric breakpoint search', () => {
  const fit = structuredClone(fitInput()) as Mutable<ReturnType<typeof fitInput>>;
  fit.profiles[0]!.observations[0]!.affinity = { status: 'unknown', reason: 'No synthetic observation.' };
  const result = analyzeNumericBreakpoints(germanyScenario(), fit, policy(), ranges());
  assert.equal(result.baseline.recommendation.status, 'needs-evidence');
  assert.ok(result.axes.every(item => item.status === 'unknown'));
});
