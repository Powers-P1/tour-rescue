import type { Knowledge, RepairOptionKind, TourShow, ZonedDateTime } from '../../src/core/domain.ts';
import type { NumericBreakpointAxis } from '../../src/core/breakpoint.ts';
import type { CheckStatus } from '../../src/core/travel-constraints.ts';
import type { ZeroViolationsGate } from '../../src/core/audit-types.ts';
import type { ApiDecisionResult } from './data.ts';
import { decisionStatus, fitDisplay, formatDate, formatDistance, optionCity, optionLetter } from './presentation.ts';

export interface LandingShow {
  readonly id: string;
  readonly cityName: string;
  readonly dateLabel: string;
  readonly startsAt: ZonedDateTime;
  readonly locked: boolean;
  readonly status: TourShow['status'];
}

export interface LandingOption {
  readonly id: string;
  readonly letter: string;
  readonly cityName: string;
  readonly kind: RepairOptionKind;
  readonly fit: Knowledge<number>;
  /** Day off is N/A; missing evidence for a show is UNKNOWN. */
  readonly fitText: string;
  readonly additionalDistanceMetres: Knowledge<number>;
  readonly additionalDistanceText: string;
  readonly feasibilityStatus: CheckStatus;
  /** Includes the independent minimum-fit and additional-distance preference gates. */
  readonly decisionStatus: CheckStatus;
  readonly recommended: boolean;
  readonly note: string;
}

export interface LandingBreakpoint {
  readonly status: NumericBreakpointAxis['status'];
  readonly beforeMetres: Knowledge<number>;
  readonly afterMetres: Knowledge<number>;
  readonly deltaMetres: Knowledge<number>;
  readonly beforeText: string;
  readonly afterText: string;
  readonly deltaText: string;
  readonly beforeCity: string;
  readonly afterCity: string;
  readonly rangeText: string;
  readonly reason: string;
  readonly minimumProven: boolean;
}

export interface LandingModel {
  readonly artistName: string;
  readonly tourName: string;
  readonly region: string;
  readonly shows: readonly LandingShow[];
  readonly lockedShowCount: number;
  readonly cancelledShowCount: number;
  readonly options: readonly LandingOption[];
  readonly recommendedOptionId: Knowledge<string>;
  readonly recommendedCity: string;
  /** The new row in the read-only route preview, when a show is recommended. */
  readonly proposedStop: Knowledge<{ readonly cityName: string; readonly dateLabel: string; readonly startsAt: ZonedDateTime }>;
  readonly additionalDistanceCapMetres: number;
  readonly additionalDistanceCapText: string;
  readonly breakpoint: LandingBreakpoint;
  readonly zeroViolationsGate: ZeroViolationsGate;
  readonly disclosure: string;
}

const known = <T>(value: T): Knowledge<T> => ({ status: 'known', value });
const unknown = (reason: string): Knowledge<never> => ({ status: 'unknown', reason });
const distance = (value: Knowledge<number>, signed = false, precision = 3): string =>
  value.status === 'known' ? formatDistance(value.value, signed, precision) : 'UNKNOWN';

/**
 * The marketing page uses the very same evaluated fixture as the app. This is
 * only a projection: no new recommendation, scoring or breakpoint arithmetic.
 */
export function createLandingModel(result: ApiDecisionResult): LandingModel {
  if (result.mode !== 'demo' || result.audit.mode !== 'demo' || result.audit.scenarioDataKind !== 'synthetic') {
    throw new TypeError('The landing preview requires the explicitly synthetic demo.');
  }
  const { audit } = result;
  const scenario = audit.replay.scenario;
  const policy = audit.replay.policy;
  const recommendation = audit.analysis.decision.recommendation;
  const recommendedOptionId = recommendation.status === 'recommended'
    ? known(recommendation.optionId) : unknown(recommendation.reason);
  const recommendedCity = recommendation.status === 'recommended' ? optionCity(result, recommendation.optionId) : 'UNKNOWN';
  const shows = scenario.tour.shows.map(show => ({
    id: show.id, cityName: scenario.cities.find(city => city.id === show.cityId)?.name ?? 'UNKNOWN',
    dateLabel: formatDate(show.schedule.startsAt), startsAt: show.schedule.startsAt,
    locked: show.locked, status: show.status,
  }));
  const options = audit.analysis.repairs.options.map((option): LandingOption => {
    const evaluation = audit.analysis.decision.options.find(row => row.optionId === option.id);
    const status = decisionStatus(result, option.id);
    const recommended = recommendation.status === 'recommended' && recommendation.optionId === option.id;
    const failed = evaluation?.checks.filter(check => check.status === 'FAIL') ?? [];
    const note = recommended ? 'Recommended'
      : status === 'UNKNOWN' ? 'More evidence needed'
        : status === 'FAIL' ? failed.some(check => check.id === 'decision:additional-distance')
          ? `Over the ${formatDistance(policy.maxAdditionalDistanceMetres, false, 3)} extra-distance cap`
          : failed[0]?.message ?? 'Fails a declared check'
          : option.kind === 'day-off' ? 'Keeps routing simple' : 'Passes the declared checks';
    const fit = fitDisplay(option);
    return {
      id: option.id, letter: optionLetter(result, option.id), cityName: optionCity(result, option.id), kind: option.kind,
      fit: option.fit, fitText: option.kind !== 'day-off' && option.fit.status === 'known' ? `${fit} / 100` : fit,
      additionalDistanceMetres: option.additionalDistanceMetres,
      additionalDistanceText: distance(option.additionalDistanceMetres, true, 1),
      feasibilityStatus: option.status, decisionStatus: status, recommended, note,
    };
  });
  const candidate = recommendation.status === 'recommended'
    ? scenario.repairCandidates.find(row => row.id === recommendation.optionId) : undefined;
  const proposedStop = candidate !== undefined && candidate.kind !== 'day-off'
    ? known({ cityName: optionCity(result, candidate.id), dateLabel: formatDate(candidate.schedule.startsAt), startsAt: candidate.schedule.startsAt })
    : unknown('No replacement performance is currently recommended.');
  const axis = audit.analysis.breakpoints.axes.find(row => row.parameter === 'maxAdditionalDistanceMetres');
  const witness = axis?.status === 'found' && axis.witness.status === 'known' ? axis.witness.value : undefined;
  const beforeMetres = axis?.baselineValue ?? known(policy.maxAdditionalDistanceMetres);
  const reason = axis?.reason ?? 'The additional-distance breakpoint was not evaluated.';
  const afterMetres = witness ? known(witness.after) : unknown(reason);
  const deltaMetres = witness ? known(witness.delta) : unknown(reason);
  const afterRecommendation = witness?.decision.recommendation;
  const range = axis?.range ?? audit.replay.ranges.maxAdditionalDistanceMetres;
  return {
    artistName: result.artists.target.name ?? 'Artist name UNKNOWN', tourName: scenario.tour.name,
    region: scenario.tour.region, shows,
    lockedShowCount: shows.filter(show => show.locked).length,
    cancelledShowCount: shows.filter(show => show.status === 'cancelled').length,
    options, recommendedOptionId, recommendedCity, proposedStop,
    additionalDistanceCapMetres: policy.maxAdditionalDistanceMetres,
    additionalDistanceCapText: formatDistance(policy.maxAdditionalDistanceMetres, false, 3),
    breakpoint: {
      status: axis?.status ?? 'unknown', beforeMetres, afterMetres, deltaMetres,
      beforeText: distance(beforeMetres), afterText: distance(afterMetres), deltaText: distance(deltaMetres),
      beforeCity: recommendedCity,
      afterCity: afterRecommendation?.status === 'recommended' ? optionCity(result, afterRecommendation.optionId) : 'UNKNOWN',
      rangeText: `${formatDistance(range.minimum, false, 3)} to ${formatDistance(range.maximum, false, 3)}`,
      reason, minimumProven: axis?.minimality === 'proven-within-range',
    },
    zeroViolationsGate: audit.zeroViolationsGate,
    disclosure: 'Synthetic taste profiles and fictional bookings; recorded OSRM road matrix. Fit is a relative taste index, not a ticket forecast.',
  };
}
