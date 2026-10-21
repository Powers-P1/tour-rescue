import type { Knowledge, TourScenario } from './domain.ts';
import type { DecisionPolicy, DecisionReport, Recommendation } from './decision-types.ts';
import type { RepairReport } from './repair-types.ts';
import { parseDecisionPolicy, recommendRepair } from './decision.ts';
import { parseTourScenario } from './parse-scenario.ts';
import { evaluateRepairOptions } from './repair-options.ts';

export type NumericBreakpointParameter =
  | 'maxAdditionalDistanceMetres'
  | 'minimumFitIndex'
  | 'additionalBudgetMinorUnits';

export interface BreakpointRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface BreakpointRanges {
  readonly schemaVersion: 'tour-rescue.breakpoint-ranges.v1';
  readonly maxAdditionalDistanceMetres: BreakpointRange;
  readonly minimumFitIndex: BreakpointRange;
  readonly additionalBudgetMinorUnits: BreakpointRange;
}

export interface BreakpointSample {
  readonly value: number;
  readonly recommendation: Recommendation;
}

export interface NumericBreakpointWitness {
  readonly parameter: NumericBreakpointParameter;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
  readonly flip: 'option-change' | 'recommendation-withdrawn';
  /** A complete check trace for this witnessed one-parameter counterfactual. */
  readonly decision: DecisionReport;
}

export interface NumericBreakpointAxis {
  readonly parameter: NumericBreakpointParameter;
  readonly range: BreakpointRange;
  readonly resolution: 1;
  readonly unit: 'metres' | 'fit-index-points' | 'minor-currency-units';
  /** Only the budget axis has a currency; no conversion is attempted. */
  readonly currency: Knowledge<string>;
  readonly baselineValue: Knowledge<number>;
  readonly status: 'found' | 'not-found' | 'unknown' | 'not-applicable';
  readonly reason: string;
  readonly checkedValues: readonly BreakpointSample[];
  readonly witness: Knowledge<NumericBreakpointWitness>;
  readonly minimality: 'proven-within-range' | 'unknown' | 'not-applicable';
}

export interface NumericBreakpointReport {
  readonly schemaVersion: 'tour-rescue.numeric-breakpoints.v1';
  readonly method: 'exact-critical-values-v1';
  readonly scenarioId: string;
  readonly baseline: DecisionReport;
  readonly ranges: BreakpointRanges;
  /** No comparison of change sizes across metres, fit points and money. */
  readonly axes: readonly NumericBreakpointAxis[];
}

export class BreakpointInputError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'BreakpointInputError';
  }
}

const parameters = ['maxAdditionalDistanceMetres', 'minimumFitIndex', 'additionalBudgetMinorUnits'] as const;
const known = <T>(value: T): Knowledge<T> => ({ status: 'known', value });
const unknown = (reason: string): Knowledge<never> => ({ status: 'unknown', reason });

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BreakpointInputError(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    throw new BreakpointInputError(path, `must contain exactly ${keys.join(', ')}`);
  }
}

function integer(value: unknown, maximum: number, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new BreakpointInputError(path, `must be a safe integer from 0 through ${maximum}`);
  }
  return value;
}

/** The searched domains are explicit integers, not a hidden sampling grid. */
export function parseBreakpointRanges(value: unknown): BreakpointRanges {
  const input = object(value, 'ranges');
  exactKeys(input, ['schemaVersion', ...parameters], 'ranges');
  if (input.schemaVersion !== 'tour-rescue.breakpoint-ranges.v1') {
    throw new BreakpointInputError('ranges.schemaVersion', 'must be tour-rescue.breakpoint-ranges.v1');
  }
  const read = (parameter: NumericBreakpointParameter): BreakpointRange => {
    const path = `ranges.${parameter}`;
    const row = object(input[parameter], path);
    exactKeys(row, ['minimum', 'maximum'], path);
    const domainMaximum = parameter === 'minimumFitIndex' ? 100 : Number.MAX_SAFE_INTEGER;
    const minimum = integer(row.minimum, domainMaximum, `${path}.minimum`);
    const maximum = integer(row.maximum, domainMaximum, `${path}.maximum`);
    if (minimum > maximum) throw new BreakpointInputError(path, 'minimum must not exceed maximum');
    return { minimum, maximum };
  };
  return {
    schemaVersion: 'tour-rescue.breakpoint-ranges.v1',
    maxAdditionalDistanceMetres: read('maxAdditionalDistanceMetres'),
    minimumFitIndex: read('minimumFitIndex'),
    additionalBudgetMinorUnits: read('additionalBudgetMinorUnits'),
  };
}

function baselineValue(parameter: NumericBreakpointParameter, scenario: TourScenario, policy: DecisionPolicy): Knowledge<number> {
  if (parameter !== 'additionalBudgetMinorUnits') return known(policy[parameter]);
  const budget = scenario.tour.constraints.additionalBudget;
  return budget.status === 'known' ? known(budget.value.minorUnits) : unknown(budget.reason);
}

/**
 * These boundaries exhaust every decision-constant interval on the declared
 * integer domain. Both sides of each inclusive threshold are retained. The
 * baseline and range endpoints supply the nearest representatives of clipped
 * intervals, so nearest means exact within these bounds, not a grid heuristic.
 */
function criticalValues(
  parameter: NumericBreakpointParameter,
  range: BreakpointRange,
  baseline: number,
  repair: RepairReport,
  scenario: TourScenario,
): number[] {
  const values = [range.minimum, range.maximum, baseline];
  const budget = scenario.tour.constraints.additionalBudget;
  for (const option of repair.options) {
    if (option.kind === 'day-off') continue;
    if (parameter === 'maxAdditionalDistanceMetres' && option.additionalDistanceMetres.status === 'known') {
      const distance = option.additionalDistanceMetres.value;
      values.push(distance - 1, distance);
    }
    if (parameter === 'minimumFitIndex' && option.fit.status === 'known') {
      const lastPassingInteger = Math.floor(option.fit.value);
      values.push(lastPassingInteger, lastPassingInteger + 1);
    }
    if (parameter === 'additionalBudgetMinorUnits' && budget.status === 'known' && option.venue.status === 'known') {
      const fee = option.venue.value.fee;
      if (fee.status === 'known' && fee.value.currency === budget.value.currency) {
        values.push(fee.value.minorUnits - 1, fee.value.minorUnits);
      }
    }
  }
  return [...new Set(values.filter(value => Number.isSafeInteger(value) && value >= range.minimum && value <= range.maximum))]
    .sort((a, b) => a - b);
}

function counterfactual(
  parameter: NumericBreakpointParameter,
  value: number,
  scenario: TourScenario,
  fitValue: unknown,
  policy: DecisionPolicy,
  repair: RepairReport,
): DecisionReport {
  if (parameter !== 'additionalBudgetMinorUnits') return recommendRepair(repair, { ...policy, [parameter]: value });
  const budget = scenario.tour.constraints.additionalBudget;
  if (budget.status !== 'known') throw new Error('Known budget is required before evaluating a budget counterfactual.');
  const changed: TourScenario = {
    ...scenario,
    tour: {
      ...scenario.tour,
      constraints: {
        ...scenario.tour.constraints,
        additionalBudget: { status: 'known', value: { ...budget.value, minorUnits: value } },
      },
    },
  };
  return recommendRepair(evaluateRepairOptions(changed, fitValue), policy);
}

function axis(
  parameter: NumericBreakpointParameter,
  range: BreakpointRange,
  scenario: TourScenario,
  fitValue: unknown,
  policy: DecisionPolicy,
  repair: RepairReport,
  baseline: DecisionReport,
): NumericBreakpointAxis {
  const value = baselineValue(parameter, scenario, policy);
  const budget = scenario.tour.constraints.additionalBudget;
  const common = {
    parameter, range, resolution: 1 as const,
    unit: parameter === 'maxAdditionalDistanceMetres' ? 'metres' as const :
      parameter === 'minimumFitIndex' ? 'fit-index-points' as const : 'minor-currency-units' as const,
    currency: parameter !== 'additionalBudgetMinorUnits' ? unknown('Not applicable: this parameter is not monetary.') :
      budget.status === 'known' ? known(budget.value.currency) : unknown(budget.reason),
    baselineValue: value,
  };
  if (value.status === 'unknown') return {
    ...common, status: 'unknown', reason: `The baseline parameter is unknown: ${value.reason}`,
    checkedValues: [], witness: unknown('A scalar change cannot be measured from an unknown baseline.'), minimality: 'unknown',
  };
  if (value.value < range.minimum || value.value > range.maximum) {
    throw new BreakpointInputError(`ranges.${parameter}`, 'must include the known baseline value');
  }
  const baselineSample: BreakpointSample = { value: value.value, recommendation: baseline.recommendation };
  if (baseline.recommendation.status === 'needs-evidence') return {
    ...common, status: 'unknown', reason: 'The baseline has no resolved recommendation to reverse.',
    checkedValues: [baselineSample], witness: unknown('Baseline recommendation needs evidence.'), minimality: 'unknown',
  };
  if (baseline.recommendation.status === 'no-feasible-option') return {
    ...common, status: 'not-applicable', reason: 'There is no baseline recommendation to reverse.',
    checkedValues: [baselineSample], witness: unknown('No option is recommended at the baseline.'), minimality: 'not-applicable',
  };
  const baselineOptionId = baseline.recommendation.optionId;
  const decisions = criticalValues(parameter, range, value.value, repair, scenario).map(candidate => ({
    value: candidate,
    decision: candidate === value.value ? baseline : counterfactual(parameter, candidate, scenario, fitValue, policy, repair),
  }));
  const checkedValues = decisions.map(sample => ({ value: sample.value, recommendation: sample.decision.recommendation }));
  const found = decisions.filter(sample => {
    const recommendation = sample.decision.recommendation;
    return recommendation.status === 'no-feasible-option' ||
      (recommendation.status === 'recommended' && recommendation.optionId !== baselineOptionId);
  }).sort((a, b) => Math.abs(a.value - value.value) - Math.abs(b.value - value.value) || a.value - b.value)[0];
  const unresolved = decisions.filter(sample => sample.decision.recommendation.status === 'needs-evidence');
  if (found === undefined) {
    if (unresolved.length > 0) return {
      ...common, status: 'unknown', reason: 'No known decision change was found, but unresolved counterfactuals prevent ruling one out in the checked range.',
      checkedValues, witness: unknown('Some checked counterfactuals need evidence; they are not witnessed flips.'), minimality: 'unknown',
    };
    return {
      ...common, status: 'not-found', reason: 'No decision change found in the checked range.',
      checkedValues, witness: unknown('No reversal exists on this declared integer domain within these bounds.'), minimality: 'not-applicable',
    };
  }
  const distance = Math.abs(found.value - value.value);
  const unresolvedCloser = unresolved.some(sample => Math.abs(sample.value - value.value) <= distance);
  return {
    ...common, status: 'found',
    reason: unresolvedCloser ? 'A decision change is witnessed, but unresolved closer counterfactuals prevent proving it minimal.' :
      'The nearest one-parameter decision change is witnessed within the checked range and declared integer resolution.',
    checkedValues,
    witness: known({
      parameter, before: value.value, after: found.value, delta: found.value - value.value,
      flip: found.decision.recommendation.status === 'no-feasible-option' ? 'recommendation-withdrawn' : 'option-change',
      decision: found.decision,
    }),
    minimality: unresolvedCloser ? 'unknown' : 'proven-within-range',
  };
}

/** Each axis changes one scalar only. No global optimum across unlike units is claimed. */
export function analyzeNumericBreakpoints(
  scenarioValue: unknown,
  fitValue: unknown | undefined,
  policyValue: unknown,
  rangesValue: unknown,
): NumericBreakpointReport {
  const scenario = parseTourScenario(scenarioValue);
  const policy = parseDecisionPolicy(policyValue);
  const ranges = parseBreakpointRanges(rangesValue);
  const repair = evaluateRepairOptions(scenario, fitValue);
  const baseline = recommendRepair(repair, policy);
  return {
    schemaVersion: 'tour-rescue.numeric-breakpoints.v1', method: 'exact-critical-values-v1',
    scenarioId: scenario.id, baseline, ranges,
    axes: parameters.map(parameter => axis(parameter, ranges[parameter], scenario, fitValue, policy, repair, baseline)),
  };
}
