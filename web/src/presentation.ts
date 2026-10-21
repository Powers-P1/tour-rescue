import type { ApiDecisionResult } from './data.ts';
import type { CancelledShow, Knowledge, Money, ZonedDateTime } from '../../src/core/domain.ts';
import type { EvaluatedRepairOption } from '../../src/core/repair-types.ts';
import type { CheckStatus } from '../../src/core/travel-constraints.ts';

const number = (value: number, maximumFractionDigits = 1): string => new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);

export function formatDistance(metres: number, signed = false, maximumFractionDigits = 1): string {
  return `${signed && metres > 0 ? '+' : ''}${number(metres / 1_000, maximumFractionDigits)} km`;
}

export function formatDuration(seconds: number, signed = false): string {
  const total = Math.abs(Math.round(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainder = total % 60;
  const chunks = [hours > 0 ? `${hours} h` : '', minutes > 0 ? `${minutes} min` : '',
    remainder > 0 && hours === 0 ? `${remainder} s` : ''].filter(Boolean);
  return `${seconds < 0 ? '−' : signed && seconds > 0 ? '+' : ''}${chunks.join(' ') || '0 min'}`;
}

export function formatMoney(money: Money): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: money.currency,
    minimumFractionDigits: money.minorUnits % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(money.minorUnits / 100);
}

export const formatFit = (value: number): string => number(value, 1);

/** Caller can put the separate reason in adjacent copy; missing evidence is never rendered as 0. */
export function knowledgeText<T>(knowledge: Knowledge<T>, formatter: (value: T) => string): string {
  return knowledge.status === 'known' ? formatter(knowledge.value) : 'UNKNOWN';
}

export function formatDate(value: ZonedDateTime, includeYear = false): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: value.timeZone, day: 'numeric', month: 'short',
    ...(includeYear ? { year: 'numeric' } as const : {}) }).format(new Date(value.iso));
}

export function cancelledShow(result: ApiDecisionResult): CancelledShow {
  const show = result.audit.replay.scenario.tour.shows.find(row => row.status === 'cancelled');
  if (show === undefined || show.status !== 'cancelled') throw new TypeError('A validated five-date scenario must have one cancelled show.');
  return show;
}

export function optionById(result: ApiDecisionResult, id: string): EvaluatedRepairOption | undefined {
  return result.audit.analysis.repairs.options.find(option => option.id === id);
}

export function optionLetter(result: ApiDecisionResult, id: string): string {
  const kind = optionById(result, id)?.kind;
  return kind === 'replacement' ? 'A' : kind === 'detour' ? 'B' : kind === 'day-off' ? 'C' : '?';
}

export function optionCity(result: ApiDecisionResult, id: string): string {
  const candidate = result.audit.replay.scenario.repairCandidates.find(row => row.id === id);
  if (candidate?.kind === 'day-off') return 'Day off';
  return candidate === undefined ? 'Unknown option' : result.audit.replay.scenario.cities.find(city => city.id === candidate.cityId)?.name ?? 'UNKNOWN';
}

export function optionTitle(result: ApiDecisionResult, id: string): string {
  return `${optionLetter(result, id)} · ${optionCity(result, id)}`;
}

export function selectedRecommendation(result: ApiDecisionResult): EvaluatedRepairOption | undefined {
  const recommendation = result.audit.analysis.decision.recommendation;
  return recommendation.status === 'recommended' ? optionById(result, recommendation.optionId) : undefined;
}

export function recommendedSummary(result: ApiDecisionResult): string {
  const recommendation = result.audit.analysis.decision.recommendation;
  return recommendation.status === 'recommended' ? optionTitle(result, recommendation.optionId)
    : recommendation.status === 'needs-evidence' ? 'More evidence needed' : 'No feasible option';
}

/** Only complete driving evidence can support a numeric maximum. Partial allocations are not a total. */
export function maxDailyDriving(option: EvaluatedRepairOption): Knowledge<number> {
  if (option.totalDrivingSeconds.status !== 'known') return option.totalDrivingSeconds;
  if (option.checks.some(check => (check.id.endsWith(':daily-driving') || check.id.endsWith(':road')) && check.status !== 'PASS')) {
    return { status: 'unknown', reason: 'The driving allocation is incomplete or conditional; the full daily maximum is UNKNOWN.' };
  }
  const byDate = new Map<string, number>();
  for (const allocation of option.drivingAllocations) {
    byDate.set(allocation.localDate, (byDate.get(allocation.localDate) ?? 0) + allocation.durationSeconds);
  }
  return { status: 'known', value: Math.max(0, ...byDate.values()) };
}

export function decisionStatus(result: ApiDecisionResult, id: string): CheckStatus {
  return result.audit.analysis.decision.options.find(row => row.optionId === id)?.status ?? 'UNKNOWN';
}

/** A day off has no cultural-fit ordinate and cannot be plotted as a neutral 50. */
export function fitDisplay(option: EvaluatedRepairOption): string {
  return option.kind === 'day-off' ? 'N/A' : knowledgeText(option.fit, formatFit);
}

export function sameDecisionPolicy(left: ApiDecisionResult, right: ApiDecisionResult): boolean {
  const a = left.audit.replay;
  const b = right.audit.replay;
  return a.policy.minimumFitIndex === b.policy.minimumFitIndex
    && a.policy.maxAdditionalDistanceMetres === b.policy.maxAdditionalDistanceMetres
    && JSON.stringify(a.scenario.tour.constraints.additionalBudget) === JSON.stringify(b.scenario.tour.constraints.additionalBudget);
}
