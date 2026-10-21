import type { Knowledge, RoadMatrix, RoadTravel, RouteConstraints, TourShow } from './domain.ts';
import { assertTimeZone, epochSeconds, localDateAt, nextLocalMidnight } from './time.ts';

export type CheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface ConstraintCheck {
  readonly id: string;
  readonly status: CheckStatus;
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface DrivingAllocation {
  readonly fromCityId: string;
  readonly toCityId: string;
  readonly localDate: string;
  readonly startsAtEpochSeconds: number;
  readonly endsAtEpochSeconds: number;
  readonly durationSeconds: number;
}

export interface RouteTravelEvaluation {
  readonly checks: readonly ConstraintCheck[];
  readonly totalDistanceMetres: Knowledge<number>;
  readonly totalDrivingSeconds: Knowledge<number>;
  readonly allocations: readonly DrivingAllocation[];
}

/** Proposed shows may be evaluated without pretending that they are confirmed. */
type ScheduledShow = Pick<TourShow, 'id' | 'cityId' | 'venueId' | 'schedule'>;
type ResolvedRoad = {
  readonly travel: Knowledge<RoadTravel>;
  readonly quality: 'recorded-road' | 'estimate' | 'same-city' | 'missing';
};

const known = <T>(value: T): Knowledge<T> => ({ status: 'known', value });
const unknown = (reason: string): Knowledge<never> => ({ status: 'unknown', reason });
const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const legKey = (from: string, to: string): string => JSON.stringify([from, to]);
const checkKey = (from: string, to: string): string => `${encodeURIComponent(from)}->${encodeURIComponent(to)}`;
const SPACING_POLICY = 'Minimum of the two directed road distances, for every pair of retained shows. A known distance below the threshold fails; both directions must be known to pass.';

function nonNegativeSafeInteger(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${path}: expected a non-negative safe integer`);
  }
}

/** FAIL dominates missing evidence; missing evidence must never become a pass. */
export function combineCheckStatuses(checks: readonly ConstraintCheck[]): CheckStatus {
  if (checks.some(check => check.status === 'FAIL')) return 'FAIL';
  if (checks.some(check => check.status === 'UNKNOWN')) return 'UNKNOWN';
  return 'PASS';
}

function addSafely(total: Knowledge<number>, value: number, unit: string): Knowledge<number> {
  if (total.status === 'unknown') return total;
  const sum = total.value + value;
  return Number.isSafeInteger(sum) ? known(sum) : unknown(`Total ${unit} exceeds safe integer precision.`);
}

/**
 * Allocate as early as possible inside one travel window. Waiting until the next
 * local day is allowed; daily usage is shared with every earlier route leg.
 * All times are absolute seconds. Midnight is resolved in the declared zone.
 */
function allocateDriving(
  fromCityId: string,
  toCityId: string,
  startsAt: number,
  deadline: number,
  requiredSeconds: number,
  constraints: RouteConstraints,
  usedByDate: Map<string, number>,
): { allocations: DrivingAllocation[]; unallocatedSeconds: number; arrival: number | null } {
  const allocations: DrivingAllocation[] = [];
  if (deadline < startsAt) return { allocations, unallocatedSeconds: requiredSeconds, arrival: null };
  if (requiredSeconds === 0) return { allocations, unallocatedSeconds: 0, arrival: startsAt };
  if (constraints.maxDailyDrivingSeconds === 0) return { allocations, unallocatedSeconds: requiredSeconds, arrival: null };

  let cursor = startsAt;
  let remaining = requiredSeconds;
  while (remaining > 0 && cursor < deadline) {
    const localDate = localDateAt(cursor, constraints.drivingDayTimeZone);
    const nextDay = nextLocalMidnight(cursor, constraints.drivingDayTimeZone);
    const used = usedByDate.get(localDate) ?? 0;
    const remainingDailyBudget = constraints.maxDailyDrivingSeconds - used;
    const availableWindow = Math.min(deadline, nextDay) - cursor;
    const durationSeconds = Math.min(remaining, remainingDailyBudget, availableWindow);
    if (durationSeconds > 0) {
      const endsAtEpochSeconds = cursor + durationSeconds;
      allocations.push({ fromCityId, toCityId, localDate, startsAtEpochSeconds: cursor, endsAtEpochSeconds, durationSeconds });
      usedByDate.set(localDate, used + durationSeconds);
      remaining -= durationSeconds;
      cursor = endsAtEpochSeconds;
      if (remaining === 0) return { allocations, unallocatedSeconds: 0, arrival: cursor };
    }
    // A full day's budget may force waiting even when the clock is before midnight.
    cursor = nextDay;
  }
  return { allocations, unallocatedSeconds: remaining, arrival: null };
}

/**
 * Conditional road scheduling only: recorded OSRM values are a free-flow
 * snapshot, estimates retain UNKNOWN evidence, and no booking is performed.
 * The caller removes the cancelled show and inserts any proposed replacement.
 */
export function evaluateRouteTravel(
  shows: readonly ScheduledShow[],
  matrix: RoadMatrix,
  constraints: RouteConstraints,
): RouteTravelEvaluation {
  assertTimeZone(constraints.drivingDayTimeZone, 'constraints.drivingDayTimeZone');
  nonNegativeSafeInteger(constraints.maxDailyDrivingSeconds, 'constraints.maxDailyDrivingSeconds');
  nonNegativeSafeInteger(constraints.minimumMarketSpacingMetres, 'constraints.minimumMarketSpacingMetres');
  if (constraints.marketSpacingMeasure !== 'road-distance') throw new TypeError('Only the explicit road-distance market-spacing policy is supported.');
  if (matrix.directed !== true) throw new TypeError('The road matrix must be directed.');
  if ((matrix.provenance.method === 'manual-estimate' || matrix.provenance.method === 'synthetic-fixture')
      && matrix.legs.some(leg => leg.quality === 'recorded-road')) {
    throw new TypeError('A manual-estimate or synthetic-fixture matrix cannot declare recorded-road legs.');
  }
  const missingRoadTimestamp = (matrix.provenance.method === 'osrm-table' || matrix.provenance.method === 'osrm-route')
    && matrix.provenance.recordedAt.status === 'unknown';

  const roads = new Map<string, ResolvedRoad>();
  for (const leg of matrix.legs) {
    const key = legKey(leg.fromCityId, leg.toCityId);
    if (roads.has(key)) throw new TypeError(`Duplicate directed road leg ${key}.`);
    if (leg.quality !== 'recorded-road' && leg.quality !== 'estimate') throw new TypeError(`Invalid road quality for ${key}.`);
    if (leg.travel.status === 'known') {
      nonNegativeSafeInteger(leg.travel.value.distanceMetres, `${key}.distanceMetres`);
      nonNegativeSafeInteger(leg.travel.value.durationSeconds, `${key}.durationSeconds`);
    } else if (leg.travel.status !== 'unknown') {
      throw new TypeError(`Invalid road knowledge status for ${key}.`);
    }
    roads.set(key, { travel: leg.travel, quality: leg.quality });
  }
  const resolveRoad = (from: string, to: string): ResolvedRoad => {
    if (from === to) return { travel: known({ distanceMetres: 0, durationSeconds: 0 }), quality: 'same-city' };
    return roads.get(legKey(from, to)) ?? { travel: unknown(`Missing directed road leg ${from} -> ${to}; the reverse direction is not a substitute.`), quality: 'missing' };
  };

  const ordered = shows.map(show => {
    const arriveBy = epochSeconds(show.schedule.arriveBy);
    const startsAt = epochSeconds(show.schedule.startsAt);
    const endsAt = epochSeconds(show.schedule.endsAt);
    const departAfter = epochSeconds(show.schedule.departAfter);
    if (arriveBy > startsAt || startsAt >= endsAt || endsAt > departAfter) {
      throw new RangeError(`Show ${show.id} has an invalid schedule ordering.`);
    }
    return { show, arriveBy, startsAt, departAfter };
  }).sort((a, b) => a.startsAt - b.startsAt || compareIds(a.show.id, b.show.id));
  if (new Set(ordered.map(row => row.show.id)).size !== ordered.length) throw new TypeError('Retained show IDs must be unique.');

  const checks: ConstraintCheck[] = [];
  const allocations: DrivingAllocation[] = [];
  const usedByDate = new Map<string, number>();
  let totalDistanceMetres: Knowledge<number> = known(0);
  let totalDrivingSeconds: Knowledge<number> = known(0);
  let earlierUnknownDuration = false;

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const next = ordered[index]!;
    const road = resolveRoad(previous.show.cityId, next.show.cityId);
    const id = `travel:${checkKey(previous.show.id, next.show.id)}`;
    const evidence = {
      fromShowId: previous.show.id, toShowId: next.show.id,
      fromCityId: previous.show.cityId, toCityId: next.show.cityId,
      departAfterEpochSeconds: previous.departAfter, arriveByEpochSeconds: next.arriveBy,
      matrixId: matrix.id, matrixMethod: matrix.provenance.method, roadQuality: road.quality,
      recordedAt: matrix.provenance.recordedAt,
      drivingDayTimeZone: constraints.drivingDayTimeZone,
      maxDailyDrivingSeconds: constraints.maxDailyDrivingSeconds,
      cityCentreModel: true,
      trafficAssumption: 'Supplied road durations are conditional values, not live traffic or a guarantee of arrival.',
    };
    checks.push({
      id: `${id}:road`,
      status: road.travel.status === 'unknown' || road.quality === 'estimate'
        || (road.quality === 'recorded-road' && missingRoadTimestamp) ? 'UNKNOWN' : 'PASS',
      message: road.travel.status === 'unknown' ? road.travel.reason
        : road.quality === 'estimate' ? 'Only estimated road evidence is available; numeric checks are conditional on those estimates.'
          : road.quality === 'same-city' ? 'Same-city travel is zero under the explicit city-centre model; venue-level travel is outside this model.'
            : missingRoadTimestamp ? 'The road-model recording time is unknown; numeric checks remain conditional on the supplied values.'
            : 'Directed road values are available; their snapshot does not include guaranteed live traffic conditions.',
      evidence,
    });

    if (road.travel.status === 'unknown') {
      totalDistanceMetres = unknown('At least one required directed route leg has unknown road evidence.');
      totalDrivingSeconds = unknown('At least one required directed route leg has unknown road evidence.');
      checks.push({
        id: `${id}:arrival`, status: next.arriveBy < previous.departAfter ? 'FAIL' : 'UNKNOWN',
        message: next.arriveBy < previous.departAfter ? 'The arrival deadline is before the previous show releases the route, even before adding travel.' : 'Arrival cannot be checked without this directed travel duration.',
        evidence,
      });
      checks.push({ id: `${id}:daily-driving`, status: 'UNKNOWN', message: 'Unknown travel duration cannot be charged to the shared calendar-day driving budgets.', evidence });
      earlierUnknownDuration = true;
      continue;
    }

    const travel = road.travel.value;
    totalDistanceMetres = addSafely(totalDistanceMetres, travel.distanceMetres, 'distance in metres');
    totalDrivingSeconds = addSafely(totalDrivingSeconds, travel.durationSeconds, 'driving time in seconds');
    const result = allocateDriving(previous.show.cityId, next.show.cityId, previous.departAfter, next.arriveBy, travel.durationSeconds, constraints, usedByDate);
    allocations.push(...result.allocations);
    const fits = result.arrival !== null;
    const conditionalStatus: CheckStatus = fits ? earlierUnknownDuration ? 'UNKNOWN' : 'PASS' : 'FAIL';
    const schedulingEvidence = {
      ...evidence, distanceMetres: travel.distanceMetres, requiredDrivingSeconds: travel.durationSeconds,
      unallocatedSeconds: result.unallocatedSeconds, earliestConditionalArrivalEpochSeconds: result.arrival,
      earlierUnknownDurationsExcluded: earlierUnknownDuration,
      sharedDailyUsageSeconds: Object.fromEntries([...usedByDate].sort(([a], [b]) => compareIds(a, b))),
    };
    checks.push({
      id: `${id}:arrival`, status: conditionalStatus,
      message: !fits ? 'No allocation of the supplied driving time meets this arrival deadline and the shared daily limits.'
        : earlierUnknownDuration ? 'The known duration fits only if earlier unknown travel consumes no additional daily budget; arrival remains unverified.'
          : 'The supplied driving time fits between departAfter and arriveBy, with waiting across local dates where needed.',
      evidence: schedulingEvidence,
    });
    checks.push({
      id: `${id}:daily-driving`, status: conditionalStatus,
      message: !fits ? 'The required driving cannot all be allocated within its window while respecting the shared daily cap.'
        : earlierUnknownDuration ? 'Known driving respects the daily cap, but earlier unknown durations may consume the same budgets.'
          : 'Driving is charged to shared local calendar-day budgets; no allocated day exceeds the cap.',
      evidence: schedulingEvidence,
    });
  }

  const threshold = constraints.minimumMarketSpacingMetres;
  if (threshold === 0) {
    checks.push({ id: 'market-spacing:disabled', status: 'PASS', message: 'A zero threshold explicitly disables market-spacing checks.', evidence: { minimumMarketSpacingMetres: 0, policy: SPACING_POLICY } });
  } else {
    for (let left = 0; left < ordered.length; left += 1) {
      for (let right = left + 1; right < ordered.length; right += 1) {
        const first = ordered[left]!.show;
        const second = ordered[right]!.show;
        const forward = resolveRoad(first.cityId, second.cityId);
        const reverse = resolveRoad(second.cityId, first.cityId);
        const distances = [forward, reverse].flatMap(road => road.travel.status === 'known' ? [road.travel.value.distanceMetres] : []);
        const tooClose = distances.some(distance => distance < threshold);
        const bothKnown = forward.travel.status === 'known' && reverse.travel.status === 'known';
        const status: CheckStatus = tooClose ? 'FAIL' : bothKnown ? 'PASS' : 'UNKNOWN';
        const id = `market-spacing:${checkKey(first.id, second.id)}`;
        const evidence = {
          fromShowId: first.id, toShowId: second.id, fromCityId: first.cityId, toCityId: second.cityId,
          minimumMarketSpacingMetres: threshold, policy: SPACING_POLICY,
          forwardDistanceMetres: forward.travel.status === 'known' ? known(forward.travel.value.distanceMetres) : forward.travel,
          reverseDistanceMetres: reverse.travel.status === 'known' ? known(reverse.travel.value.distanceMetres) : reverse.travel,
          forwardQuality: forward.quality, reverseQuality: reverse.quality,
          recordedAt: matrix.provenance.recordedAt,
          numericResultConditionalOnSuppliedValues: true,
        };
        checks.push({ id, status, message: tooClose ? 'At least one supplied directed distance is below the minimum market spacing.'
          : bothKnown ? 'Both supplied directed distances meet the minimum market spacing.'
            : 'A missing direction prevents establishing the minimum of both directed distances.', evidence });
        const usesEstimates = forward.quality === 'estimate' || reverse.quality === 'estimate';
        const usesUndatedRoad = missingRoadTimestamp && (forward.quality === 'recorded-road' || reverse.quality === 'recorded-road');
        if (usesEstimates || usesUndatedRoad) {
          checks.push({
            id: `${id}:road-evidence`, status: 'UNKNOWN',
            message: usesEstimates && usesUndatedRoad ? 'Market spacing uses estimated and undated road evidence; its numeric result is conditional.'
              : usesEstimates ? 'Market spacing uses estimated road evidence; its numeric result is conditional.'
                : 'Market spacing uses a road model with unknown recording time; its numeric result is conditional.',
            evidence,
          });
        }
      }
    }
  }

  if (totalDistanceMetres.status === 'unknown' || totalDrivingSeconds.status === 'unknown') {
    checks.push({
      id: 'travel:totals', status: 'UNKNOWN', message: 'Complete, safely representable route totals are unavailable.',
      evidence: { totalDistanceMetres, totalDrivingSeconds },
    });
  }
  return { checks, totalDistanceMetres, totalDrivingSeconds, allocations };
}
