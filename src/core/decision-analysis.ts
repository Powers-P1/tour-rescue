import type { Knowledge, TourScenario } from './domain.ts';
import type { FitReport } from './fit-types.ts';
import type { RepairReport } from './repair-types.ts';
import type { DecisionReport, Recommendation } from './decision-types.ts';
import type { ArtistOmissionFit } from './fit-sensitivity.ts';
import type { NumericBreakpointReport } from './breakpoint.ts';
import { parseTourScenario } from './parse-scenario.ts';
import { evaluateRepairOptions } from './repair-options.ts';
import { recommendRepair } from './decision.ts';
import { computeLeaveOneArtistOutFits } from './fit-sensitivity.ts';
import { analyzeNumericBreakpoints } from './breakpoint.ts';

export type ArtistSensitivityOutcome =
  | 'retained'
  | 'option-changed'
  | 'recommendation-withdrawn'
  | 'unresolved'
  | 'not-comparable';

export interface ArtistSensitivityRun extends ArtistOmissionFit {
  readonly decision: DecisionReport;
  readonly outcome: ArtistSensitivityOutcome;
  readonly reason: string;
}

export interface ArtistSensitivityReport {
  readonly schemaVersion: 'tour-rescue.artist-sensitivity.v1';
  readonly scope: 'comparison-artists-only';
  readonly normalization: 'proportional-survivor-weights-v1';
  readonly status: 'complete' | 'unknown' | 'not-applicable';
  readonly reason: string;
  readonly baseline: Recommendation;
  readonly runs: readonly ArtistSensitivityRun[];
  readonly summary: {
    readonly totalRuns: number;
    readonly comparableRuns: number;
    readonly retainedRuns: number;
    readonly changedOptionRuns: number;
    readonly withdrawnRuns: number;
    readonly unresolvedRuns: number;
    readonly notComparableRuns: number;
    /** Defined only when every requested omission can be compared with a recommendation. */
    readonly retainedRecommendationFraction: Knowledge<number>;
  };
}

export interface TourDecisionAnalysis {
  readonly schemaVersion: 'tour-rescue.decision-analysis.v1';
  readonly scenarioId: string;
  readonly dataKind: TourScenario['dataKind'];
  readonly repairs: RepairReport;
  readonly decision: DecisionReport;
  readonly breakpoints: NumericBreakpointReport;
  readonly artistSensitivity: ArtistSensitivityReport;
}

const unknown = (reason: string): Knowledge<never> => ({ status: 'unknown', reason });

/** Baseline decisions always go through the agreed scenario 50/50 boundary. */
export function evaluateTourDecision(
  scenarioValue: unknown,
  fitValue: unknown | undefined,
  policyValue: unknown,
): { readonly repairs: RepairReport; readonly decision: DecisionReport } {
  const repairs = evaluateRepairOptions(scenarioValue, fitValue);
  return { repairs, decision: recommendRepair(repairs, policyValue) };
}

/**
 * Only fit changes in an artist-omission run. Existing routes, booking facts and
 * constraint results remain those of the validated baseline. This deliberately
 * does not relax the public evaluateRepairOptions scenario-weight rule.
 */
function attachSensitivityFit(
  scenario: TourScenario,
  baseline: RepairReport,
  fitReport: FitReport,
): RepairReport {
  const cityByOption = new Map(scenario.repairCandidates.flatMap(candidate =>
    candidate.kind === 'day-off' ? [] : [[candidate.id, candidate.cityId] as const]));
  const cityFit = new Map(fitReport.cities.map(city => [city.cityId, city.value]));
  return {
    ...baseline,
    fitReport: { status: 'known', value: fitReport },
    options: baseline.options.map(option => ({
      ...option,
      fit: option.kind === 'day-off' ? option.fit :
        cityFit.get(cityByOption.get(option.id)!) ?? unknown('Candidate city is outside the frozen fit set.'),
    })),
  };
}

function compareRecommendation(
  baseline: Recommendation,
  after: Recommendation,
): { outcome: ArtistSensitivityOutcome; reason: string } {
  if (baseline.status !== 'recommended') return {
    outcome: 'not-comparable',
    reason: 'There is no baseline recommendation to retain or reverse; a recovered decision is not a witnessed flip.',
  };
  if (after.status === 'needs-evidence') return {
    outcome: 'unresolved', reason: 'Missing evidence prevents establishing the omission decision.',
  };
  if (after.status === 'no-feasible-option') return {
    outcome: 'recommendation-withdrawn', reason: 'After this omission, no option satisfies the declared decision gates.',
  };
  return baseline.optionId === after.optionId
    ? { outcome: 'retained', reason: 'The same option remains recommended after this comparison artist is omitted.' }
    : { outcome: 'option-changed', reason: 'Omitting this comparison artist changes the recommended option.' };
}

function summarizeRuns(runs: readonly ArtistSensitivityRun[]): ArtistSensitivityReport['summary'] {
  const count = (outcome: ArtistSensitivityOutcome) => runs.filter(run => run.outcome === outcome).length;
  const retainedRuns = count('retained');
  const changedOptionRuns = count('option-changed');
  const withdrawnRuns = count('recommendation-withdrawn');
  const unresolvedRuns = count('unresolved');
  const notComparableRuns = count('not-comparable');
  const comparableRuns = retainedRuns + changedOptionRuns + withdrawnRuns;
  return {
    totalRuns: runs.length, comparableRuns, retainedRuns, changedOptionRuns, withdrawnRuns,
    unresolvedRuns, notComparableRuns,
    retainedRecommendationFraction: runs.length > 0 && comparableRuns === runs.length
      ? { status: 'known', value: retainedRuns / runs.length }
      : unknown(runs.length === 0 ? 'There are no comparison-artist omission runs.' :
        'Every requested omission must be comparable; unresolved runs are not dropped from the denominator.'),
  };
}

function artistSensitivity(
  scenario: TourScenario,
  fitValue: unknown | undefined,
  baselineRepairs: RepairReport,
  baselineDecision: DecisionReport,
): ArtistSensitivityReport {
  const common = {
    schemaVersion: 'tour-rescue.artist-sensitivity.v1' as const,
    scope: 'comparison-artists-only' as const,
    normalization: 'proportional-survivor-weights-v1' as const,
    baseline: baselineDecision.recommendation,
  };
  if (fitValue === undefined) return {
    ...common, status: 'unknown', reason: 'No normalized artist profiles were supplied.',
    runs: [], summary: summarizeRuns([]),
  };
  const fits = computeLeaveOneArtistOutFits(fitValue);
  const runs: ArtistSensitivityRun[] = fits.runs.map(run => {
    const decision = recommendRepair(attachSensitivityFit(scenario, baselineRepairs, run.fitReport), baselineDecision.policy);
    return { ...run, decision, ...compareRecommendation(baselineDecision.recommendation, decision.recommendation) };
  });
  const summary = summarizeRuns(runs);
  if (runs.length === 0) return {
    ...common, status: 'not-applicable', reason: 'No comparison artists are selected; the target is never omitted.',
    runs, summary,
  };
  if (baselineDecision.recommendation.status === 'no-feasible-option') return {
    ...common, status: 'not-applicable', reason: 'There is no baseline recommendation; omission outcomes are retained for inspection.',
    runs, summary,
  };
  if (summary.unresolvedRuns > 0 || summary.notComparableRuns > 0) return {
    ...common, status: 'unknown', reason: 'At least one omission cannot be compared with a known baseline recommendation.',
    runs, summary,
  };
  return {
    ...common, status: 'complete',
    reason: 'Every selected comparison was omitted once with proportional survivor weights and the frozen city set.',
    runs, summary,
  };
}

/**
 * Reproducible decision, bounded single-variable searches and explicit artist
 * ablations. No clock, network, new Qloo query, LLM or input mutation is involved.
 */
export function analyzeTourDecision(
  scenarioValue: unknown,
  fitValue: unknown | undefined,
  policyValue: unknown,
  rangesValue: unknown,
): TourDecisionAnalysis {
  const scenario = parseTourScenario(scenarioValue);
  const { repairs, decision } = evaluateTourDecision(scenario, fitValue, policyValue);
  return {
    schemaVersion: 'tour-rescue.decision-analysis.v1', scenarioId: scenario.id, dataKind: scenario.dataKind,
    repairs, decision,
    breakpoints: analyzeNumericBreakpoints(scenario, fitValue, decision.policy, rangesValue),
    artistSensitivity: artistSensitivity(scenario, fitValue, repairs, decision),
  };
}
