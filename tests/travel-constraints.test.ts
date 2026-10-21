import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConfirmedShow, DirectedRoadLeg, RoadMatrix, RouteConstraints, ZonedDateTime } from '../src/core/domain.ts';
import { combineCheckStatuses, evaluateRouteTravel } from '../src/core/travel-constraints.ts';
import type { ConstraintCheck, RouteTravelEvaluation } from '../src/core/travel-constraints.ts';

const HOUR = 3600;
const instant = (iso: string, timeZone = 'Etc/UTC'): ZonedDateTime => ({ iso, timeZone });
const show = (id: string, cityId: string, arrive: string, depart: string, timeZone = 'Etc/UTC'): ConfirmedShow => ({
  id, cityId, venueId: `venue-${id}`, status: 'confirmed', locked: true,
  schedule: { arriveBy: instant(arrive, timeZone), startsAt: instant(arrive, timeZone), endsAt: instant(depart, timeZone), departAfter: instant(depart, timeZone) },
});
const road = (fromCityId: string, toCityId: string, distanceMetres: number, durationSeconds: number, quality: DirectedRoadLeg['quality'] = 'recorded-road'): DirectedRoadLeg => ({
  fromCityId, toCityId, quality, travel: { status: 'known', value: { distanceMetres, durationSeconds } },
});
const matrix = (...legs: DirectedRoadLeg[]): RoadMatrix => ({
  id: 'synthetic-road-contract-test', directed: true,
  provenance: {
    source: 'Fictional unit-test MOCK of the OSRM recorded-road contract; not live roads',
    method: 'osrm-table', recordedAt: { status: 'known', value: instant('2026-01-01T00:00:00+00:00') },
    description: 'Synthetic numeric values and a dummy timestamp test the recorded-road interface only; no request or actual recording occurred.',
  },
  legs,
});
const constraints = (maxDailyDrivingSeconds = 4 * HOUR, minimumMarketSpacingMetres = 0, drivingDayTimeZone = 'Etc/UTC'): RouteConstraints => ({
  maxDailyDrivingSeconds, minimumMarketSpacingMetres, drivingDayTimeZone, marketSpacingMeasure: 'road-distance',
  additionalBudget: { status: 'unknown', reason: 'Not used by the travel evaluator.' },
});
const standardPair = (): ConfirmedShow[] => [
  show('show-a', 'a', '2026-11-01T06:00:00+00:00', '2026-11-01T08:00:00+00:00'),
  show('show-b', 'b', '2026-11-01T12:00:00+00:00', '2026-11-01T14:00:00+00:00'),
];
const status = (result: RouteTravelEvaluation) => combineCheckStatuses(result.checks);
const check = (result: RouteTravelEvaluation, id: string): ConstraintCheck => {
  const found = result.checks.find(item => item.id === id);
  assert.ok(found, `Missing check ${id}`);
  return found;
};

test('directed route uses A -> B values and never substitutes the reverse direction', () => {
  const pair = standardPair();
  const full = evaluateRouteTravel(pair, matrix(road('a', 'b', 12_345, HOUR), road('b', 'a', 98_765, 3 * HOUR)), constraints());
  assert.equal(status(full), 'PASS');
  assert.deepEqual(full.totalDistanceMetres, { status: 'known', value: 12_345 });
  assert.deepEqual(full.totalDrivingSeconds, { status: 'known', value: HOUR });
  const missing = evaluateRouteTravel(pair, matrix(road('b', 'a', 98_765, 3 * HOUR)), constraints());
  assert.equal(status(missing), 'UNKNOWN');
  assert.equal(missing.totalDistanceMetres.status, 'unknown');
  assert.equal(missing.totalDrivingSeconds.status, 'unknown');
  assert.match(check(missing, 'travel:show-a->show-b:road').message, /reverse direction is not a substitute/);
});

test('a leg longer than the daily cap can pass by waiting and using multiple local dates', () => {
  const shows = [
    show('a', 'a', '2026-11-01T20:00:00+00:00', '2026-11-01T22:00:00+00:00'),
    show('b', 'b', '2026-11-02T02:00:00+00:00', '2026-11-02T04:00:00+00:00'),
  ];
  const result = evaluateRouteTravel(shows, matrix(road('a', 'b', 150_000, 3 * HOUR)), constraints(2 * HOUR));
  assert.equal(status(result), 'PASS');
  assert.deepEqual(result.allocations.map(row => [row.localDate, row.durationSeconds]), [['2026-11-01', 2 * HOUR], ['2026-11-02', HOUR]]);
  assert.deepEqual(result.totalDrivingSeconds, { status: 'known', value: 3 * HOUR });
});

test('daily driving is shared across legs, so individually fitting same-day trips can fail together', () => {
  const shows = [
    show('a', 'a', '2026-11-01T06:00:00+00:00', '2026-11-01T08:00:00+00:00'),
    show('b', 'b', '2026-11-01T10:00:00+00:00', '2026-11-01T11:00:00+00:00'),
    show('c', 'c', '2026-11-01T13:00:00+00:00', '2026-11-01T15:00:00+00:00'),
  ];
  const result = evaluateRouteTravel(shows, matrix(road('a', 'b', 20_000, 2 * HOUR), road('b', 'c', 20_000, 2 * HOUR)), constraints(3 * HOUR));
  assert.equal(status(result), 'FAIL');
  assert.equal(check(result, 'travel:a->b:arrival').status, 'PASS');
  assert.equal(check(result, 'travel:b->c:daily-driving').status, 'FAIL');
  assert.equal(check(result, 'travel:b->c:arrival').evidence.unallocatedSeconds, HOUR);
  assert.equal(result.allocations.reduce((sum, allocation) => sum + allocation.durationSeconds, 0), 3 * HOUR);
});

test('unused clock time becomes waiting until the next day when the daily budget is spent', () => {
  const shows = [
    show('a', 'a', '2026-11-01T06:00:00+00:00', '2026-11-01T08:00:00+00:00'),
    show('b', 'b', '2026-11-02T03:00:00+00:00', '2026-11-02T05:00:00+00:00'),
  ];
  const result = evaluateRouteTravel(shows, matrix(road('a', 'b', 20_000, 4 * HOUR)), constraints(2 * HOUR));
  assert.equal(status(result), 'PASS');
  assert.deepEqual(result.allocations.map(row => row.durationSeconds), [2 * HOUR, 2 * HOUR]);
  assert.equal(result.allocations[1]!.startsAtEpochSeconds - result.allocations[0]!.endsAtEpochSeconds, 14 * HOUR);
});

test('same-city travel is explicitly zero without a matrix self-leg', () => {
  const pair = standardPair();
  const shows = [pair[0]!, { ...pair[1]!, cityId: 'a' }];
  const result = evaluateRouteTravel(shows, matrix(), constraints(0));
  assert.equal(status(result), 'PASS');
  assert.deepEqual(result.totalDistanceMetres, { status: 'known', value: 0 });
  assert.deepEqual(result.totalDrivingSeconds, { status: 'known', value: 0 });
  assert.deepEqual(result.allocations, []);
  assert.match(check(result, 'travel:show-a->show-b:road').message, /city-centre/);
});

test('unknown earlier travel does not hide a proven independent failure between later locked shows', () => {
  const shows = [
    show('a', 'a', '2026-11-01T06:00:00+00:00', '2026-11-01T08:00:00+00:00'),
    show('b', 'b', '2026-11-01T10:00:00+00:00', '2026-11-01T11:00:00+00:00'),
    show('c', 'c', '2026-11-01T12:00:00+00:00', '2026-11-01T13:00:00+00:00'),
  ];
  const result = evaluateRouteTravel(shows, matrix(road('b', 'c', 200_000, 2 * HOUR)), constraints(8 * HOUR));
  assert.equal(status(result), 'FAIL');
  assert.equal(check(result, 'travel:a->b:road').status, 'UNKNOWN');
  assert.equal(check(result, 'travel:b->c:arrival').status, 'FAIL');
  assert.equal(result.totalDistanceMetres.status, 'unknown');
});

test('a later conditional success remains UNKNOWN when earlier missing duration may use its daily budget', () => {
  const shows = [
    show('a', 'a', '2026-11-01T06:00:00+00:00', '2026-11-01T08:00:00+00:00'),
    show('b', 'b', '2026-11-01T10:00:00+00:00', '2026-11-01T11:00:00+00:00'),
    show('c', 'c', '2026-11-01T14:00:00+00:00', '2026-11-01T15:00:00+00:00'),
  ];
  const result = evaluateRouteTravel(shows, matrix(road('b', 'c', 20_000, HOUR)), constraints(2 * HOUR));
  assert.equal(status(result), 'UNKNOWN');
  assert.equal(check(result, 'travel:b->c:arrival').status, 'UNKNOWN');
  assert.equal(check(result, 'travel:b->c:arrival').evidence.earlierUnknownDurationsExcluded, true);
  assert.equal(result.allocations.length, 1);
});

test('negative travel windows fail even when the directed road duration is unknown', () => {
  const shows = [
    show('a', 'a', '2026-11-01T06:00:00+00:00', '2026-11-01T12:00:00+00:00'),
    show('b', 'b', '2026-11-01T11:00:00+00:00', '2026-11-01T14:00:00+00:00'),
  ];
  const result = evaluateRouteTravel(shows, matrix(), constraints());
  assert.equal(check(result, 'travel:a->b:arrival').status, 'FAIL');
  assert.equal(status(result), 'FAIL');
});

test('estimated roads retain numeric conditional checks but cannot establish road evidence', () => {
  const result = evaluateRouteTravel(standardPair(), matrix(road('a', 'b', 20_000, HOUR, 'estimate')), constraints());
  assert.equal(status(result), 'UNKNOWN');
  assert.equal(check(result, 'travel:show-a->show-b:road').status, 'UNKNOWN');
  assert.equal(check(result, 'travel:show-a->show-b:arrival').status, 'PASS');
  assert.deepEqual(result.totalDistanceMetres, { status: 'known', value: 20_000 });
});

test('market spacing includes non-adjacent retained shows and fails on either short direction', () => {
  const shows = [
    show('a', 'a', '2026-11-01T06:00:00+00:00', '2026-11-01T08:00:00+00:00'),
    show('b', 'b', '2026-11-02T06:00:00+00:00', '2026-11-02T08:00:00+00:00'),
    show('c', 'c', '2026-11-03T06:00:00+00:00', '2026-11-03T08:00:00+00:00'),
  ];
  const result = evaluateRouteTravel(shows, matrix(
    road('a', 'b', 100_000, HOUR), road('b', 'a', 100_000, HOUR),
    road('b', 'c', 100_000, HOUR), road('c', 'b', 100_000, HOUR),
    road('a', 'c', 100_000, HOUR), road('c', 'a', 5_000, HOUR),
  ), constraints(4 * HOUR, 10_000));
  assert.equal(check(result, 'market-spacing:a->c').status, 'FAIL');
  assert.equal(check(result, 'market-spacing:a->b').status, 'PASS');
  assert.equal(status(result), 'FAIL');
});

test('market spacing needs both directions for PASS, but one known short direction proves FAIL', () => {
  const large = evaluateRouteTravel(standardPair(), matrix(road('a', 'b', 20_000, HOUR)), constraints(4 * HOUR, 10_000));
  assert.equal(check(large, 'market-spacing:show-a->show-b').status, 'UNKNOWN');
  const small = evaluateRouteTravel(standardPair(), matrix(road('a', 'b', 9_999, HOUR)), constraints(4 * HOUR, 10_000));
  assert.equal(check(small, 'market-spacing:show-a->show-b').status, 'FAIL');
  const equal = evaluateRouteTravel(standardPair(), matrix(road('a', 'b', 10_000, HOUR), road('b', 'a', 10_000, HOUR)), constraints(4 * HOUR, 10_000));
  assert.equal(status(equal), 'PASS');
});

test('estimated non-route reverse distance makes otherwise passing market spacing UNKNOWN overall', () => {
  const result = evaluateRouteTravel(standardPair(), matrix(road('a', 'b', 20_000, HOUR), road('b', 'a', 20_000, HOUR, 'estimate')), constraints(4 * HOUR, 10_000));
  assert.equal(check(result, 'market-spacing:show-a->show-b').status, 'PASS');
  assert.equal(check(result, 'market-spacing:show-a->show-b:road-evidence').status, 'UNKNOWN');
  assert.equal(status(result), 'UNKNOWN');
});

test('spring DST uses the 23-hour local day instead of assuming 86400 seconds', () => {
  const zone = 'Europe/Warsaw';
  const shows = [
    show('a', 'a', '2026-03-28T20:00:00+01:00', '2026-03-28T23:00:00+01:00', zone),
    show('b', 'b', '2026-03-30T01:00:00+02:00', '2026-03-30T03:00:00+02:00', zone),
  ];
  const result = evaluateRouteTravel(shows, matrix(road('a', 'b', 100_000, 25 * HOUR)), constraints(24 * HOUR, 0, zone));
  assert.equal(status(result), 'PASS');
  assert.deepEqual(result.allocations.map(row => [row.localDate, row.durationSeconds]), [['2026-03-28', HOUR], ['2026-03-29', 23 * HOUR], ['2026-03-30', HOUR]]);
});

test('autumn DST has 25 clock hours in a local day while the driving cap remains unchanged', () => {
  const zone = 'Europe/Warsaw';
  const shows = [
    show('a', 'a', '2026-10-24T20:00:00+02:00', '2026-10-25T00:00:00+02:00', zone),
    show('b', 'b', '2026-10-26T00:00:00+01:00', '2026-10-26T02:00:00+01:00', zone),
  ];
  const result = evaluateRouteTravel(shows, matrix(road('a', 'b', 100_000, 25 * HOUR)), constraints(25 * HOUR, 0, zone));
  assert.equal(status(result), 'PASS');
  assert.deepEqual(result.allocations.map(row => [row.localDate, row.durationSeconds]), [['2026-10-25', 25 * HOUR]]);
  const capped = evaluateRouteTravel(shows, matrix(road('a', 'b', 100_000, 25 * HOUR)), constraints(24 * HOUR, 0, zone));
  assert.equal(status(capped), 'FAIL');
});

test('route order is chronological, matrix order is irrelevant, and frozen inputs stay unchanged', () => {
  const shows = standardPair();
  const roads = matrix(road('a', 'b', 20_000, HOUR), road('b', 'a', 30_000, 2 * HOUR));
  const limits = constraints();
  const before = structuredClone({ shows, roads, limits });
  function freezeDeep(value: unknown): void {
    if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(freezeDeep);
      Object.freeze(value);
    }
  }
  freezeDeep({ shows, roads, limits });
  const result = evaluateRouteTravel(shows, roads, limits);
  assert.deepEqual(result, evaluateRouteTravel([...shows].reverse(), { ...roads, legs: [...roads.legs].reverse() }, limits));
  assert.deepEqual({ shows, roads, limits }, before);
});

test('safe total arithmetic returns UNKNOWN rather than an imprecise large distance', () => {
  const shows = [
    ...standardPair(),
    show('show-c', 'c', '2026-11-02T12:00:00+00:00', '2026-11-02T14:00:00+00:00'),
  ];
  const result = evaluateRouteTravel(shows, matrix(road('a', 'b', Number.MAX_SAFE_INTEGER, HOUR), road('b', 'c', 1, HOUR)), constraints());
  assert.equal(result.totalDistanceMetres.status, 'unknown');
  assert.deepEqual(result.totalDrivingSeconds, { status: 'known', value: 2 * HOUR });
  assert.equal(status(result), 'UNKNOWN');
});

test('FAIL dominates UNKNOWN, including conditional numeric failure with estimated road evidence', () => {
  const result = evaluateRouteTravel(standardPair(), matrix(road('a', 'b', 20_000, 5 * HOUR, 'estimate')), constraints(8 * HOUR));
  assert.equal(check(result, 'travel:show-a->show-b:road').status, 'UNKNOWN');
  assert.equal(check(result, 'travel:show-a->show-b:arrival').status, 'FAIL');
  assert.equal(status(result), 'FAIL');
  assert.equal(combineCheckStatuses([]), 'PASS');
});

test('invalid integer quantities and duplicate directed road entries cannot be evaluated silently', () => {
  assert.throws(() => evaluateRouteTravel(standardPair(), matrix(road('a', 'b', 1.5, HOUR)), constraints()), /safe integer/);
  assert.throws(() => evaluateRouteTravel(standardPair(), matrix(road('a', 'b', 1, HOUR), road('a', 'b', 2, HOUR)), constraints()), /Duplicate directed/);
  assert.throws(() => evaluateRouteTravel(standardPair(), matrix(), constraints(-1)), /safe integer/);
});

test('an unknown OSRM timestamp keeps numeric checks conditional and guards route and spacing evidence', () => {
  const source = matrix(road('a', 'b', 20_000, HOUR), road('b', 'a', 30_000, HOUR));
  const recordedAt = { status: 'unknown' as const, reason: 'No source recording time was supplied.' };
  const undated: RoadMatrix = { ...source, provenance: { ...source.provenance, recordedAt } };
  const result = evaluateRouteTravel(standardPair(), undated, constraints(4 * HOUR, 10_000));
  assert.equal(status(result), 'UNKNOWN');
  assert.equal(check(result, 'travel:show-a->show-b:road').status, 'UNKNOWN');
  assert.equal(check(result, 'travel:show-a->show-b:arrival').status, 'PASS');
  assert.equal(check(result, 'market-spacing:show-a->show-b').status, 'PASS');
  assert.equal(check(result, 'market-spacing:show-a->show-b:road-evidence').status, 'UNKNOWN');
  assert.deepEqual(check(result, 'market-spacing:show-a->show-b:road-evidence').evidence.recordedAt, recordedAt);
  assert.deepEqual(result.totalDrivingSeconds, { status: 'known', value: HOUR });
  const sameCity = standardPair().map(item => ({ ...item, cityId: 'a' }));
  assert.equal(status(evaluateRouteTravel(sameCity, undated, constraints())), 'PASS', 'Unused undated matrix entries must not taint the explicit zero same-city model.');
});

test('manual or synthetic matrix provenance cannot masquerade as recorded-road evidence', () => {
  for (const method of ['manual-estimate', 'synthetic-fixture'] as const) {
    const source = matrix(road('a', 'b', 20_000, HOUR));
    const contradictory: RoadMatrix = { ...source, provenance: { ...source.provenance, method } };
    assert.throws(() => evaluateRouteTravel(standardPair(), contradictory, constraints()), /cannot declare recorded-road/);
  }
});

test('direct travel evaluation rejects zero-length performances rather than accepting their windows', () => {
  const pair = standardPair();
  const first = pair[0]!;
  const invalid = { ...first, schedule: { ...first.schedule, endsAt: first.schedule.startsAt } };
  assert.throws(() => evaluateRouteTravel([invalid, pair[1]!], matrix(road('a', 'b', 20_000, HOUR)), constraints()), /invalid schedule ordering/);
});
