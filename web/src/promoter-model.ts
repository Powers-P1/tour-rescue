import type { ApiDecisionResult } from '../../worker/src/app.ts';
import type { Knowledge, Money } from '../../src/core/domain.ts';
import type { CheckStatus, ConstraintCheck } from '../../src/core/travel-constraints.ts';

/** Text and status content shared by the HTML print page and browser PNG. */
export interface PromoterCheckGroup {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly checkIds: readonly string[];
  readonly counts: Readonly<Record<CheckStatus, number>>;
}

export interface PromoterSheetModel {
  readonly optionId: string;
  readonly optionLabel: string;
  readonly artist: string;
  readonly city: string;
  readonly date: string;
  readonly timeZone: string;
  readonly drivingTimeZone: string;
  readonly modeLabel: string;
  readonly provenanceNote: string;
  readonly recommendation: string;
  readonly decisionStatus: CheckStatus;
  readonly recommendationNote: string;
  readonly venue: string;
  readonly venueNote: string;
  readonly fit: string;
  readonly fitNote: string;
  readonly extraDistance: string;
  readonly extraDriving: string;
  readonly maximumDailyDriving: string;
  readonly dailyDrivingLimit: string;
  readonly distanceLimit: string;
  readonly venueFee: string;
  readonly venueFeeLimit: string;
  readonly comparisons: readonly { readonly slot: number; readonly name: string; readonly status: 'known' | 'unknown' }[];
  readonly sensitivityNote: string;
  readonly checkGroups: readonly PromoterCheckGroup[];
  readonly checkCount: number;
  readonly checkCounts: Readonly<Record<CheckStatus, number>>;
  readonly risks: readonly string[];
  readonly sourceLines: readonly string[];
  readonly generatedAt: string;
  readonly runId: string;
}

const number = (value: number, digits = 3) => new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: digits,
}).format(value);
const named = (artist: { readonly name?: string; readonly id: string }) =>
  artist.name?.trim() || `Name UNKNOWN (${artist.id})`;
const counts = (checks: readonly ConstraintCheck[]) => ({
  PASS: checks.filter(check => check.status === 'PASS').length,
  FAIL: checks.filter(check => check.status === 'FAIL').length,
  UNKNOWN: checks.filter(check => check.status === 'UNKNOWN').length,
});
const aggregate = (checks: readonly ConstraintCheck[]): CheckStatus =>
  checks.some(check => check.status === 'FAIL') ? 'FAIL'
    : checks.length === 0 || checks.some(check => check.status === 'UNKNOWN') ? 'UNKNOWN' : 'PASS';

function distance(value: Knowledge<number>, signed = false): string {
  return value.status === 'unknown' ? 'UNKNOWN' : `${signed && value.value > 0 ? '+' : ''}${number(value.value / 1000)} km`;
}

function duration(seconds: number, signed = false): string {
  const absolute = Math.abs(seconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const remainder = absolute % 60;
  return `${seconds < 0 ? '-' : signed && seconds > 0 ? '+' : ''}${[
    ...(hours ? [`${hours} h`] : []), ...(minutes ? [`${minutes} min`] : []),
    ...(remainder || (!hours && !minutes) ? [`${remainder} s`] : []),
  ].join(' ')}`;
}

function money(value: Knowledge<Money>): string {
  return value.status === 'unknown' ? 'UNKNOWN' : `${value.value.currency} ${number(value.value.minorUnits / 100, 2)}`;
}

function category(check: ConstraintCheck): readonly [string, string] {
  if (check.id === 'locked-commitments') return ['locked', 'Locked dates unchanged'];
  if (check.id.startsWith('market-spacing:')) return ['spacing', 'Market spacing'];
  if (check.id.endsWith(':road') || check.id === 'travel:totals') return ['roads', 'Directed road evidence'];
  if (check.id.endsWith(':arrival')) return ['arrival', 'Departure and arrival windows'];
  if (check.id.endsWith(':daily-driving')) return ['driving', 'Shared daily driving limits'];
  if (check.id === 'venue-availability') return ['availability', 'Supplied venue availability'];
  if (check.id === 'venue-fee-budget') return ['fee', 'Venue fee within ceiling'];
  if (check.id === 'venue-not-required') return ['venue', 'No new venue required'];
  if (check.id === 'decision:minimum-fit') return ['fit', 'Minimum fit preference'];
  if (check.id === 'decision:additional-distance') return ['distance', 'Extra-distance preference'];
  return ['other', 'Other declared checks'];
}

/** Every decision check is represented once; group status never hides FAIL or UNKNOWN. */
export function groupPromoterChecks(checks: readonly ConstraintCheck[]): readonly PromoterCheckGroup[] {
  const groups = new Map<string, { label: string; checks: ConstraintCheck[] }>();
  for (const check of checks) {
    const [id, label] = category(check);
    const group = groups.get(id) ?? { label, checks: [] };
    group.checks.push(check);
    groups.set(id, group);
  }
  return [...groups].map(([id, group]) => ({
    id, label: group.label, status: aggregate(group.checks),
    checkIds: group.checks.map(check => check.id), counts: counts(group.checks),
  }));
}

export function buildPromoterModel(result: ApiDecisionResult, optionId: string): PromoterSheetModel {
  const { audit } = result;
  const { scenario } = audit.replay;
  const option = audit.analysis.repairs.options.find(row => row.id === optionId);
  const selectedDecision = audit.analysis.decision.options.find(row => row.optionId === optionId);
  const candidate = scenario.repairCandidates.find(row => row.id === optionId);
  if (!option || !selectedDecision || !candidate) throw new Error('Select an option from the current audit before creating a promoter sheet.');
  const cancelled = scenario.tour.shows.find(show => show.id === candidate.cancelledShowId);
  if (!cancelled) throw new Error('The selected option has no cancelled date in the audit.');
  const city = candidate.kind === 'day-off' ? undefined : scenario.cities.find(row => row.id === candidate.cityId);
  const schedule = candidate.kind === 'day-off' ? cancelled.schedule : candidate.schedule;
  const timeZone = city?.timeZone ?? schedule.startsAt.timeZone;
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(schedule.startsAt.iso));
  const recommendation = audit.analysis.decision.recommendation;
  const isRecommended = recommendation.status === 'recommended' && recommendation.optionId === optionId;
  const checkGroups = groupPromoterChecks(selectedDecision.checks);
  const status = aggregate(selectedDecision.checks);
  const dailyUsage = new Map<string, number>();
  for (const allocation of option.drivingAllocations) {
    dailyUsage.set(allocation.localDate, (dailyUsage.get(allocation.localDate) ?? 0) + allocation.durationSeconds);
  }
  // Partial allocations can respect the cap while some required driving is unallocated.
  // Only describe the maximum as complete when road/schedule checks are PASS.
  const completeDriving = option.totalDrivingSeconds.status === 'known' && selectedDecision.checks
    .filter(check => check.id.startsWith('travel:'))
    .every(check => check.status === 'PASS');
  const maximumDailyDriving = completeDriving ? duration(Math.max(0, ...dailyUsage.values())) : 'UNKNOWN';
  const sensitivity = audit.analysis.artistSensitivity;
  const summary = sensitivity.summary;
  const sensitivityNote = sensitivity.status === 'not-applicable'
    ? `Leave one artist out: not applicable. ${sensitivity.reason}`
    : summary.retainedRecommendationFraction.status === 'unknown'
      ? `Leave one artist out: UNKNOWN. ${summary.comparableRuns}/${summary.totalRuns} omissions comparable; ${summary.unresolvedRuns} unresolved. The touring artist stays fixed.`
      : `Leave one artist out: ${summary.retainedRuns}/${summary.totalRuns} omissions retain the baseline recommendation; ${summary.changedOptionRuns} change it${summary.withdrawnRuns ? `; ${summary.withdrawnRuns} withdraw it` : ''}. The touring artist stays fixed.`;
  const comparisons = Array.from({ length: 3 }, (_, index) => {
    const artist = result.artists.comparisons[index];
    return { slot: index + 1, name: artist ? named(artist) : 'UNKNOWN - no artist supplied', status: artist ? 'known' as const : 'unknown' as const };
  });
  const risks: string[] = [];
  const nonPassingGroups = checkGroups.filter(group => group.status !== 'PASS');
  for (const group of nonPassingGroups.slice(0, 2)) {
    const first = selectedDecision.checks.find(check => group.checkIds.includes(check.id) && check.status === group.status);
    risks.push(`${group.status}: ${group.label}. ${first?.message ?? 'See the audit for missing evidence.'}`);
  }
  if (nonPassingGroups.length > 2) risks.push(`${nonPassingGroups.length - 2} additional check groups need attention; see the statuses below and full audit.`);
  if (option.kind !== 'day-off') {
    if (option.venue.status === 'unknown') risks.push(`Venue evidence UNKNOWN: ${option.venue.reason}`);
    else {
      const missing: string[] = [];
      if (option.venue.value.capacityPeople.status === 'unknown') missing.push('capacity');
      if (option.venue.value.promoterTerms.status === 'unknown') missing.push('promoter agreement');
      if (missing.length) risks.push(`UNKNOWN: ${missing.join(' and ')}. These are outside the declared check gate.`);
    }
  }
  if (summary.changedOptionRuns > 0 || summary.withdrawnRuns > 0) risks.push('The recommendation is sensitive to a comparison artist; review the leave-one-out evidence.');
  if (scenario.dataKind === 'synthetic') risks.push('Booking facts are fictional; the venue and date still need real confirmation.');
  risks.push('OSRM is a frozen city-centre road model; traffic, driver-rest rules and travel costs are not verified.');
  // Failed acquisition attempts do not appear among usable normalized profiles,
  // but are still source records. Do not describe a failed live run as "0 queries".
  const qlooQueries = audit.queries.filter(query => query.operation === 'artist-heatmap');
  const synthetic = audit.mode === 'demo';
  const actualTimes = qlooQueries.flatMap(query => query.responseRecordedAt.status === 'known' ? [query.responseRecordedAt.value] : []).sort();
  const unknownTimes = qlooQueries.length - actualTimes.length;
  const failedQueries = qlooQueries.filter(query => query.status === 'failed').length;
  const fitReport = audit.analysis.repairs.fitReport;
  const hasUsableFit = fitReport.status === 'known' && fitReport.value.cities.some(city => city.value.status === 'known');
  const road = audit.sourceTimestamps.road;
  const qlooLine = synthetic
    ? 'Qloo-shaped synthetic taste fixtures; no Qloo request or acquisition timestamp.'
    : `Qloo: ${hasUsableFit ? 'derived within-query percentiles' : 'fit UNKNOWN; no usable fit index'}; ${qlooQueries.length} query records${failedQueries ? ` (${failedQueries} failed)` : ''}. Acquired: ${actualTimes.length ? `${actualTimes[0]}${actualTimes[actualTimes.length - 1] === actualTimes[0] ? '' : ` to ${actualTimes[actualTimes.length - 1]}`}` : 'UNKNOWN'}${unknownTimes ? `; ${unknownTimes} timestamps UNKNOWN` : ''}.`;
  const roadLine = `OSRM: ${road.matrixId}; ${road.method}; recorded ${road.recordedAt.status === 'known' ? road.recordedAt.value.iso : 'UNKNOWN'}.`;
  const dataLabel = result.mode === 'demo' ? 'DEMO - synthetic taste data'
    : hasUsableFit ? 'LIVE - Qloo taste evidence' : 'LIVE RUN - Qloo fit UNKNOWN';
  const countsForOption = counts(selectedDecision.checks);
  return {
    optionId, optionLabel: `${option.kind === 'replacement' ? 'A' : option.kind === 'detour' ? 'B' : 'C'} - ${option.kind === 'day-off' ? 'Day off' : option.kind === 'replacement' ? 'Replacement show' : 'Detour show'}`,
    artist: named(result.artists.target), city: option.kind === 'day-off' ? 'Day off - no performance city' : city?.name ?? 'UNKNOWN city',
    date, timeZone, drivingTimeZone: scenario.tour.constraints.drivingDayTimeZone, modeLabel: dataLabel,
    provenanceNote: scenario.dataKind === 'synthetic' ? 'Fictional booking scenario; no venue is confirmed by this document.' : 'Booker-supplied scenario; this document does not confirm a booking.',
    recommendation: isRecommended ? 'Recommended for investigation' : status === 'FAIL' ? 'Excluded by current checks' : status === 'UNKNOWN' ? 'Evidence needed - not recommended' : 'Selected alternative - not recommended',
    decisionStatus: status,
    recommendationNote: isRecommended
      ? `Zero-violations gate: ${audit.zeroViolationsGate.status}. ${countsForOption.FAIL} failed; ${countsForOption.UNKNOWN} unknown declared checks. Passing checks are conditional on supplied inputs.`
      : `Selected-option checks: ${countsForOption.FAIL} failed; ${countsForOption.UNKNOWN} unknown. The audit's recommendation gate does not certify this alternative.`,
    venue: option.kind === 'day-off' ? 'Not applicable - no venue required' : 'Venue to confirm: ____________________',
    venueNote: option.kind === 'day-off' ? 'The four surviving shows remain in the route.' : option.venue.status === 'known' ? `Scenario input: ${option.venue.value.name}. Proposed only.` : `UNKNOWN: ${option.venue.reason}`,
    fit: option.kind === 'day-off' ? 'N/A' : option.fit.status === 'known' ? number(option.fit.value, 1) : 'UNKNOWN',
    fitNote: option.kind === 'day-off' ? 'No performance city; no cultural-fit score.' : `Percentile-based index across ${audit.frozenCandidateSet.status === 'known' ? audit.frozenCandidateSet.value.cityIds.length : 'UNKNOWN'} frozen cities. Not an attendance forecast.`,
    extraDistance: distance(option.additionalDistanceMetres, true),
    extraDriving: option.additionalDrivingSeconds.status === 'known' ? duration(option.additionalDrivingSeconds.value, true) : 'UNKNOWN',
    maximumDailyDriving, dailyDrivingLimit: duration(scenario.tour.constraints.maxDailyDrivingSeconds),
    distanceLimit: distance({ status: 'known', value: audit.replay.policy.maxAdditionalDistanceMetres }),
    venueFee: option.kind === 'day-off' ? 'N/A' : option.venue.status === 'known' ? money(option.venue.value.fee) : 'UNKNOWN',
    venueFeeLimit: money(scenario.tour.constraints.additionalBudget),
    comparisons, sensitivityNote, checkGroups, checkCount: selectedDecision.checks.length, checkCounts: countsForOption,
    risks, sourceLines: [qlooLine, roadLine], generatedAt: audit.generatedAt, runId: audit.runId,
  };
}
