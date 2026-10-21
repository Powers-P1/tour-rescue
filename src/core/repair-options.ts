import type {
  CancelledShow, ConfirmedShow, Knowledge, RepairCandidate, ShowRepairCandidate,
  Tour, TourScenario, Venue,
} from './domain.ts';
import type { FitReport } from './fit-types.ts';
import type { EvaluatedRepairOption, EvaluatedRouteStop, RepairReport } from './repair-types.ts';
import { parseTourScenario, ScenarioInputError } from './parse-scenario.ts';
import { computeScenarioFitIndex } from './scenario-fit.ts';
import { epochSeconds, localDateAt } from './time.ts';
import {
  combineCheckStatuses, evaluateRouteTravel,
} from './travel-constraints.ts';
import type { ConstraintCheck, RouteTravelEvaluation } from './travel-constraints.ts';

const unknown = (reason: string): Knowledge<never> => ({ status: 'unknown', reason });
const scheduleKeys = ['arriveBy', 'startsAt', 'endsAt', 'departAfter'] as const;
const optionOrder = ['replacement', 'detour', 'day-off'] as const;

/** Verifies exact commitment preservation, independently of the option builder. */
export function checkLockedCommitments(
  tour: Tour,
  route: readonly EvaluatedRouteStop[],
): ConstraintCheck {
  const locked = tour.shows.filter((show): show is ConfirmedShow => show.status === 'confirmed');
  const violatedIds = locked.filter(original => {
    const matches = route.filter(stop => stop.id === original.id);
    const actual = matches[0];
    return matches.length !== 1 || actual === undefined ||
      actual.status !== 'confirmed' || actual.locked !== true ||
      actual.cityId !== original.cityId || actual.venueId !== original.venueId ||
      scheduleKeys.some(key => actual.schedule[key].iso !== original.schedule[key].iso ||
        actual.schedule[key].timeZone !== original.schedule[key].timeZone);
  }).map(show => show.id);
  const expectedOrder = locked.map(show => show.id);
  const actualOrder = route.filter(stop => expectedOrder.includes(stop.id)).map(stop => stop.id);
  const orderPreserved = actualOrder.length === expectedOrder.length &&
    actualOrder.every((id, index) => id === expectedOrder[index]);
  const passed = violatedIds.length === 0 && orderPreserved;
  return {
    id: 'locked-commitments', status: passed ? 'PASS' : 'FAIL',
    message: passed ? 'Every confirmed show keeps its identity, venue, city, schedule and order.' :
      'A confirmed commitment was changed, removed, duplicated or reordered.',
    evidence: { lockedShowIds: expectedOrder, violatedIds, orderPreserved },
  };
}

function routeFor(scenario: TourScenario, candidate: RepairCandidate): readonly EvaluatedRouteStop[] {
  return scenario.tour.shows.flatMap((show): EvaluatedRouteStop[] => {
    if (show.status === 'confirmed') return [show];
    if (candidate.kind === 'day-off') return [];
    return [{
      id: show.id, cityId: candidate.cityId, venueId: candidate.venueId,
      schedule: candidate.schedule, status: 'proposed', locked: false,
    }];
  });
}

function availabilityCheck(candidate: ShowRepairCandidate, venue: Venue, venueTimeZone: string): ConstraintCheck {
  const requiredDate = localDateAt(epochSeconds(candidate.schedule.startsAt), venueTimeZone);
  const availability = venue.availability;
  const evidence = {
    venueId: venue.id, requiredDate, timeZone: venueTimeZone, availability,
  };
  if (availability.status === 'unknown') return {
    id: 'venue-availability', status: 'UNKNOWN', message: availability.reason, evidence,
  };
  if (availability.value.localDate !== requiredDate ||
      availability.value.timeZone !== venueTimeZone) return {
    id: 'venue-availability', status: 'UNKNOWN',
    message: 'Supplied availability does not cover the proposed local date and time zone.', evidence,
  };
  return {
    id: 'venue-availability', status: availability.value.available ? 'PASS' : 'FAIL',
    message: availability.value.available ? 'The booker supplied availability for this date.' :
      'The booker supplied unavailability for this date.', evidence,
  };
}

function feeCheck(scenario: TourScenario, venue: Venue): ConstraintCheck {
  const fee = venue.fee;
  const budget = scenario.tour.constraints.additionalBudget;
  const evidence = { venueId: venue.id, fee, budget, scope: 'venue-fee-only' };
  if (fee.status === 'unknown' || budget.status === 'unknown') return {
    id: 'venue-fee-budget', status: 'UNKNOWN',
    message: [fee.status === 'unknown' ? fee.reason : '', budget.status === 'unknown' ? budget.reason : '']
      .filter(Boolean).join(' '), evidence,
  };
  if (fee.value.currency !== budget.value.currency) return {
    id: 'venue-fee-budget', status: 'UNKNOWN',
    message: 'Fee and budget currencies differ; no exchange rate or conversion is assumed.', evidence,
  };
  const passed = fee.value.minorUnits <= budget.value.minorUnits;
  return {
    id: 'venue-fee-budget', status: passed ? 'PASS' : 'FAIL',
    message: passed ? 'The supplied venue fee fits the stated ceiling; other costs are not modelled.' :
      'The supplied venue fee alone exceeds the stated ceiling.', evidence,
  };
}

function signedDifference(value: Knowledge<number>, baseline: Knowledge<number>): Knowledge<number> {
  if (value.status === 'unknown') return unknown(value.reason);
  if (baseline.status === 'unknown') return unknown(`Day-off baseline: ${baseline.reason}`);
  const difference = value.value - baseline.value;
  return Number.isSafeInteger(difference) ? { status: 'known', value: difference } :
    unknown('The difference cannot be represented as a safe integer.');
}

function fitFor(candidate: RepairCandidate, fit: Knowledge<FitReport>): Knowledge<number> {
  if (candidate.kind === 'day-off') return unknown('Not applicable: a day off has no proposed performance market.');
  if (fit.status === 'unknown') return fit;
  return fit.value.cities.find(city => city.cityId === candidate.cityId)?.value ??
    unknown(`Candidate city ${candidate.cityId} is outside the frozen fit candidate set.`);
}

/**
 * Builds and checks all three supplied repair candidates. It never changes locked
 * dates, fetches data, invents booking facts, or suppresses a failed option.
 */
export function evaluateRepairOptions(scenarioValue: unknown, fitValue?: unknown): RepairReport {
  const scenario = parseTourScenario(scenarioValue);
  const fit: Knowledge<FitReport> = fitValue === undefined ? unknown('No normalized cultural-fit input supplied.') :
    { status: 'known', value: computeScenarioFitIndex(fitValue) };
  if (fit.status === 'known') {
    const cityIds = new Set(scenario.cities.map(city => city.id));
    const outside = fit.value.candidateSet.cityIds.find(id => !cityIds.has(id));
    if (outside !== undefined) throw new ScenarioInputError('fit.candidateSet', `unknown scenario city ${outside}`);
  }

  const cancelled = scenario.tour.shows.find((show): show is CancelledShow => show.status === 'cancelled')!;
  const prepared = optionOrder.map(kind => {
    const candidate = scenario.repairCandidates.find(option => option.kind === kind)!;
    const route = routeFor(scenario, candidate);
    const travel = evaluateRouteTravel(route, scenario.roadMatrix, scenario.tour.constraints);
    return { candidate, route, travel };
  });
  const baseline = prepared.find(item => item.candidate.kind === 'day-off')!;
  const options = prepared.map(({ candidate, route, travel }): EvaluatedRepairOption => {
    const routingChecks = [checkLockedCommitments(scenario.tour, route), ...travel.checks];
    let venue: Knowledge<Venue>;
    let venueChecks: readonly ConstraintCheck[];
    if (candidate.kind === 'day-off') {
      venue = unknown('Not applicable: no replacement performance or venue is proposed.');
      venueChecks = [{
        id: 'venue-not-required', status: 'PASS', message: 'No new venue is required for a day off.',
        evidence: { cancelledShowId: cancelled.id },
      }];
    } else {
      const found = scenario.venues.find(item => item.id === candidate.venueId)!;
      venue = { status: 'known', value: found };
      const venueTimeZone = scenario.cities.find(city => city.id === found.cityId)!.timeZone;
      venueChecks = [availabilityCheck(candidate, found, venueTimeZone), feeCheck(scenario, found)];
    }
    const checks = [...routingChecks, ...venueChecks];
    return {
      id: candidate.id, kind: candidate.kind, route, checks,
      status: combineCheckStatuses(checks), routingStatus: combineCheckStatuses(routingChecks),
      venueStatus: combineCheckStatuses(venueChecks), venue, fit: fitFor(candidate, fit),
      totalDistanceMetres: travel.totalDistanceMetres,
      totalDrivingSeconds: travel.totalDrivingSeconds,
      additionalDistanceMetres: delta(candidate, travel, baseline.travel, 'totalDistanceMetres'),
      additionalDrivingSeconds: delta(candidate, travel, baseline.travel, 'totalDrivingSeconds'),
      drivingAllocations: travel.allocations,
    };
  });
  const passingOptionIds = options.filter(option => option.status === 'PASS').map(option => option.id);
  return {
    schemaVersion: 'tour-rescue.repair-report.v1', policy: 'locked-slot-three-options-v1',
    scenarioId: scenario.id, dataKind: scenario.dataKind,
    distanceBaselineOptionId: baseline.candidate.id, fitReport: fit, options, passingOptionIds,
    decisionState: passingOptionIds.length > 0 ? 'options-pass-checks' :
      options.some(option => option.status === 'UNKNOWN') ? 'needs-evidence' : 'no-feasible-option',
    assumptions: [
      'Candidates and replacement/detour labels are supplied by the booker; no corridor is inferred.',
      'Road distances and free-flow times use city centres and the supplied frozen directed matrix.',
      'Driving may be split between local days inside each departure/arrival window; traffic, breaks and overnight locations are not modelled.',
      'Market spacing covers all retained show pairs and uses the smaller of both directed road distances.',
      'PASS concerns declared routing checks, date-specific availability and the venue-fee ceiling only; it is not a confirmed booking or a complete cost estimate.',
      'Capacity and promoter terms are retained as evidence; no attendance requirement or agreement is inferred.',
      'Cultural fit and signed extra kilometres are independent; a day off has no fit score.',
    ],
  };
}

function delta(
  candidate: RepairCandidate,
  travel: RouteTravelEvaluation,
  baseline: RouteTravelEvaluation,
  field: 'totalDistanceMetres' | 'totalDrivingSeconds',
): Knowledge<number> {
  // The baseline's delta from itself is an identity, even when its length is unknown.
  return candidate.kind === 'day-off' ? { status: 'known', value: 0 } :
    signedDifference(travel[field], baseline[field]);
}
