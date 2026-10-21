import assert from 'node:assert/strict';
import test from 'node:test';
import { checkLockedCommitments, evaluateRepairOptions } from '../src/core/repair-options.ts';
import { parseSyntheticHeatmapFitInput } from '../src/core/scenario-fit.ts';
import type { EvaluatedRepairOption, EvaluatedRouteStop } from '../src/core/repair-types.ts';
import { fixture, freezeDeep, germanyScenario, polishScenario } from './helpers/scenarios.ts';
import type { Mutable } from './helpers/scenarios.ts';

const fitInput = () => parseSyntheticHeatmapFitInput(fixture('qloo/heatmap_de_synthetic.json'));
const option = (options: readonly EvaluatedRepairOption[], kind: string): EvaluatedRepairOption => {
  const found = options.find(item => item.kind === kind);
  assert.ok(found);
  return found;
};

test('Germany frozen fixtures produce three options with measured directed deltas and independent fit', () => {
  const scenario = germanyScenario();
  const report = evaluateRepairOptions(scenario, fitInput());
  assert.deepEqual(report.options.map(item => item.kind), ['replacement', 'detour', 'day-off']);
  assert.deepEqual(report.options.map(item => item.status), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(report.options.map(item => item.totalDistanceMetres), [
    { status: 'known', value: 1468106 }, { status: 'known', value: 1803835 },
    { status: 'known', value: 1449738 },
  ]);
  assert.deepEqual(report.options.map(item => item.additionalDistanceMetres), [
    { status: 'known', value: 18368 }, { status: 'known', value: 354097 }, { status: 'known', value: 0 },
  ]);
  assert.deepEqual(report.options.map(item => item.totalDrivingSeconds), [
    { status: 'known', value: 53881 }, { status: 'known', value: 65109 }, { status: 'known', value: 52232 },
  ]);
  assert.equal(report.distanceBaselineOptionId, 'day-off');
  assert.equal(report.fitReport.status, 'known');
  assert.equal(report.options[0]?.fit.status, 'known');
  assert.equal(report.options[1]?.fit.status, 'known');
  assert.equal(report.options[2]?.fit.status, 'unknown');
  assert.equal(report.decisionState, 'options-pass-checks');
  assert.equal(report.passingOptionIds.length, 3);
});

test('all four locked shows survive exactly; candidate stays proposed and day-off has four stops', () => {
  const scenario = germanyScenario();
  const locked = scenario.tour.shows.filter(show => show.status === 'confirmed');
  const report = evaluateRepairOptions(scenario);
  for (const repair of report.options) {
    assert.deepEqual(repair.route.filter(show => show.status === 'confirmed'), locked);
    assert.equal(repair.route.length, repair.kind === 'day-off' ? 4 : 5);
    const proposed = repair.route.find(show => show.status === 'proposed');
    if (repair.kind !== 'day-off') {
      assert.equal(proposed?.locked, false);
      assert.equal(proposed?.id, 'show-3');
      assert.deepEqual(proposed?.schedule, scenario.tour.shows[2].schedule);
    }
  }
});

test('commitment verifier detects changes, loss, duplicates and reordered locked dates', () => {
  const scenario = germanyScenario();
  const original = evaluateRepairOptions(scenario).options[0]!.route;
  for (const change of ['city', 'venue', 'time', 'status', 'remove', 'duplicate', 'order'] as const) {
    const route = structuredClone(original) as Mutable<EvaluatedRouteStop[]>;
    if (change === 'city') route[0]!.cityId = 'de-berlin';
    if (change === 'venue') route[0]!.venueId = 'venue-de-berlin';
    if (change === 'time') route[0]!.schedule.startsAt.iso = '2026-11-10T21:00:00+01:00';
    if (change === 'status') route[0] = { ...route[0]!, status: 'proposed', locked: false };
    if (change === 'remove') route.shift();
    if (change === 'duplicate') route.push(route[0]!);
    if (change === 'order') [route[0], route[1]] = [route[1]!, route[0]!];
    assert.equal(checkLockedCommitments(scenario.tour, route).status, 'FAIL', change);
  }
});

test('the original five-date PR1 fixture evaluates without inventing venue or road evidence', () => {
  const report = evaluateRepairOptions(polishScenario());
  assert.equal(report.options.length, 3);
  assert.deepEqual(report.options.map(item => item.status), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  assert.equal(report.decisionState, 'needs-evidence');
  assert.deepEqual(report.passingOptionIds, []);
  assert.deepEqual(report.options.map(item => item.totalDistanceMetres), [
    { status: 'known', value: 631000 }, { status: 'known', value: 715000 }, { status: 'known', value: 629000 },
  ]);
  assert.deepEqual(report.options.map(item => item.additionalDistanceMetres), [
    { status: 'known', value: 2000 }, { status: 'known', value: 86000 }, { status: 'known', value: 0 },
  ]);
  assert.equal(report.options[0]?.venueStatus, 'UNKNOWN');
  assert.equal(report.options[0]?.fit.status, 'unknown');
});

test('unknown, unavailable and wrong-date venues are distinguished from routing feasibility', () => {
  for (const state of ['unknown', 'unavailable', 'wrong-date', 'wrong-zone'] as const) {
    const scenario = germanyScenario();
    const venue = scenario.venues.find(item => item.id === 'venue-de-nuremberg')!;
    venue.availability = state === 'unknown' ? { status: 'unknown', reason: 'No booker evidence.' } :
      { status: 'known', value: {
        localDate: state === 'wrong-date' ? '2026-11-15' : '2026-11-14',
        timeZone: state === 'wrong-zone' ? 'Europe/London' : 'Europe/Berlin',
        available: state !== 'unavailable',
      } };
    const replacement = option(evaluateRepairOptions(scenario).options, 'replacement');
    assert.equal(replacement.routingStatus, 'PASS');
    assert.equal(replacement.venueStatus, state === 'unavailable' ? 'FAIL' : 'UNKNOWN', state);
    assert.equal(replacement.status, state === 'unavailable' ? 'FAIL' : 'UNKNOWN', state);
  }
});

test('availability uses the venue city calendar even when schedule instants are displayed in UTC', () => {
  const scenario = germanyScenario();
  const schedules = [...scenario.tour.shows.map(show => show.schedule),
    ...scenario.repairCandidates.flatMap(candidate => candidate.kind === 'day-off' ? [] : [candidate.schedule])];
  for (const schedule of schedules) {
    for (const instant of Object.values(schedule)) {
      instant.iso = new Date(instant.iso).toISOString().replace('.000Z', '+00:00');
      instant.timeZone = 'Etc/UTC';
    }
  }
  const replacement = option(evaluateRepairOptions(scenario).options, 'replacement');
  const check = replacement.checks.find(item => item.id === 'venue-availability');
  assert.equal(check?.status, 'PASS');
  assert.equal(check?.evidence.timeZone, 'Europe/Berlin');
  assert.equal(check?.evidence.requiredDate, '2026-11-14');
});

test('fee ceiling uses exact minor units; unknown amounts and currency mismatch never pass', () => {
  for (const state of ['equal', 'over', 'unknown-fee', 'unknown-budget', 'currency'] as const) {
    const scenario = germanyScenario();
    const venue = scenario.venues.find(item => item.id === 'venue-de-nuremberg')!;
    venue.fee = state === 'unknown-fee' ? { status: 'unknown', reason: 'No quote supplied.' } :
      { status: 'known', value: { currency: state === 'currency' ? 'USD' : 'EUR',
        minorUnits: state === 'over' ? 100001 : 100000 } };
    if (state === 'unknown-budget') scenario.tour.constraints.additionalBudget = {
      status: 'unknown', reason: 'No ceiling supplied.',
    };
    const replacement = option(evaluateRepairOptions(scenario).options, 'replacement');
    const check = replacement.checks.find(item => item.id === 'venue-fee-budget');
    assert.equal(check?.status, state === 'equal' ? 'PASS' : state === 'over' ? 'FAIL' : 'UNKNOWN', state);
    assert.equal(check?.evidence.scope, 'venue-fee-only');
  }
});

test('capacity and promoter terms remain explicit evidence, never fabricated from cultural fit', () => {
  const replacement = option(evaluateRepairOptions(germanyScenario(), fitInput()).options, 'replacement');
  assert.equal(replacement.venue.status, 'known');
  if (replacement.venue.status !== 'known') assert.fail('Expected supplied venue evidence.');
  assert.equal(replacement.venue.value.capacityPeople.status, 'unknown');
  assert.equal(replacement.venue.value.promoterTerms.status, 'unknown');
  assert.equal(replacement.venue.value.qlooEntityId.status, 'unknown');
});

test('failed routes remain visible; fit cannot override a violated daily driving constraint', () => {
  const scenario = germanyScenario();
  const original = evaluateRepairOptions(scenario, fitInput());
  scenario.tour.constraints.maxDailyDrivingSeconds = 1;
  const report = evaluateRepairOptions(scenario, fitInput());
  assert.equal(report.options.length, 3);
  assert.ok(report.options.every(item => item.status === 'FAIL'));
  assert.equal(report.decisionState, 'no-feasible-option');
  assert.deepEqual(report.passingOptionIds, []);
  assert.deepEqual(report.options.map(item => item.fit), original.options.map(item => item.fit));
});

test('missing directed travel never borrows the reverse or invents total distances', () => {
  const scenario = germanyScenario();
  scenario.roadMatrix.legs = scenario.roadMatrix.legs.filter(leg =>
    !(leg.fromCityId === 'de-hamburg' && leg.toCityId === 'de-berlin'));
  const report = evaluateRepairOptions(scenario);
  assert.ok(report.options.every(item => item.routingStatus === 'UNKNOWN'));
  assert.ok(report.options.every(item => item.totalDistanceMetres.status === 'unknown'));
  assert.equal(report.options[0]?.additionalDistanceMetres.status, 'unknown');
  assert.deepEqual(report.options[2]?.additionalDistanceMetres, { status: 'known', value: 0 });
  assert.equal(report.decisionState, 'needs-evidence');
});

test('a proven failure dominates unrelated unknowns without hiding their checks', () => {
  const scenario = germanyScenario();
  const venue = scenario.venues.find(item => item.id === 'venue-de-nuremberg')!;
  venue.availability = { status: 'unknown', reason: 'No date-specific evidence.' };
  venue.fee = { status: 'known', value: { currency: 'EUR', minorUnits: 100001 } };
  const result = option(evaluateRepairOptions(scenario).options, 'replacement');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.checks.some(check => check.status === 'UNKNOWN'));
  assert.ok(result.checks.some(check => check.status === 'FAIL'));
});

test('scenario entry enforces default weights while fit remains separate from road and fee checks', () => {
  const data = structuredClone(fitInput()) as Mutable<ReturnType<typeof fitInput>>;
  data.profiles[0]!.weight = 0.6;
  data.profiles[1]!.weight = 0.2;
  data.profiles[2]!.weight = 0.2;
  assert.throws(() => evaluateRepairOptions(germanyScenario(), data), /weight|50|0\.5/i);
});

test('a different frozen city universe is rejected instead of attaching unrelated scores', () => {
  assert.throws(() => evaluateRepairOptions(polishScenario(), fitInput()), /unknown scenario city/);
});

test('option evaluation is reproducible, independent of candidate input order, and leaves frozen inputs untouched', () => {
  const scenario = germanyScenario();
  const fit = fitInput();
  const original = structuredClone(scenario);
  freezeDeep(scenario);
  freezeDeep(fit);
  const report = evaluateRepairOptions(scenario, fit);
  assert.deepEqual(evaluateRepairOptions(scenario, fit), report);
  original.repairCandidates.reverse();
  assert.deepEqual(evaluateRepairOptions(original, fit), report);
  original.repairCandidates.reverse();
  assert.deepEqual(scenario, original);
});
