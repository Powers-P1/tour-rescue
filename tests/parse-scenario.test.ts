import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { TourScenario, ZonedDateTime } from '../src/core/domain.ts';
import { parseTourScenario, ScenarioInputError } from '../src/core/parse-scenario.ts';
import { assertTimeZone, epochSeconds, localDateAt, nextLocalMidnight, parseZonedDateTime } from '../src/core/time.ts';

type Mutable<T> = { -readonly [P in keyof T]: Mutable<T[P]> };
const fixtureUrl = new URL('../fixtures/synthetic/tour__five-dates__one-cancelled.json', import.meta.url);
const input = (): Mutable<TourScenario> => JSON.parse(readFileSync(fixtureUrl, 'utf8')) as Mutable<TourScenario>;
const at = (iso: string, timeZone = 'Europe/Warsaw'): ZonedDateTime => ({ iso, timeZone });

function invalid(change: (data: Mutable<TourScenario>) => void, pattern: RegExp): void {
  const data = input();
  change(data);
  assert.throws(() => parseTourScenario(data), pattern);
}

function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
}

test('parses the actual PR1 five-date fixture without upgrading synthetic or unknown evidence', () => {
  const data = input();
  const snapshot = structuredClone(data);
  freezeDeep(data);
  const parsed = parseTourScenario(data);
  assert.deepEqual(parsed, snapshot);
  assert.deepEqual(data, snapshot);
  assert.notEqual(parsed, data);
  assert.notEqual(parsed.tour.shows[0], data.tour.shows[0]);
  assert.equal(parsed.tour.shows.filter(show => show.status === 'cancelled').length, 1);
  assert.equal(parsed.tour.shows.filter(show => show.status === 'confirmed' && show.locked).length, 4);
  assert.ok(parsed.venues.every(venue => venue.availability.status === 'unknown'));
  assert.ok(parsed.roadMatrix.legs.every(leg => leg.quality === 'estimate'));
});

test('requires the known scenario version, source kind and five shows', () => {
  for (const value of [null, [], 5, { ...input(), schemaVersion: 2 }, { ...input(), dataKind: 'live-qloo' }]) {
    assert.throws(() => parseTourScenario(value), ScenarioInputError);
  }
  invalid(data => { data.tour.shows.pop(); }, /exactly five shows/);
  const supplied = input();
  supplied.dataKind = 'user-supplied';
  assert.equal(parseTourScenario(supplied).dataKind, 'user-supplied');
});

test('sparse array entries cannot bypass runtime validation', () => {
  invalid(data => { data.cities.length += 1; }, /scenario.cities\[7\].*must be an object/);
  invalid(data => { delete (data.tour.shows as unknown[])[0]; }, /scenario.tour.shows\[0\].*must be an object/);
});

test('requires exactly one cancelled show and leaves every confirmation locked', () => {
  invalid(data => { data.tour.shows[0].locked = false; }, /confirmed shows must remain locked/);
  invalid(data => { data.tour.shows[2].locked = true; }, /cancelled show must not be locked/);
  invalid(data => { Object.assign(data.tour.shows[0], { status: 'cancelled', locked: false, reason: 'Another cancellation' }); }, /exactly one cancelled/);
  invalid(data => { Object.assign(data.tour.shows[2], { status: 'confirmed', locked: true }); }, /exactly one cancelled/);
  invalid(data => { Object.assign(data.tour.shows[0], { status: 'tentative' }); }, /status/);
});

test('checks the complete operational windows for chronological order and overlap', () => {
  invalid(data => { data.tour.shows[0].schedule.departAfter.iso = '2026-11-11T17:00:00+01:00'; }, /ascending and nonoverlapping/);
  invalid(data => { data.tour.shows.reverse(); }, /ascending and nonoverlapping/);
  invalid(data => { data.tour.shows[0].schedule.endsAt = data.tour.shows[0].schedule.startsAt; }, /arriveBy <= startsAt < endsAt <= departAfter/);
  invalid(data => { data.tour.shows[0].schedule.arriveBy.iso = '2026-11-10T21:00:00+01:00'; }, /arriveBy <= startsAt/);
  invalid(data => { data.tour.shows[0].schedule.departAfter.iso = '2026-11-10T21:00:00+01:00'; }, /endsAt <= departAfter/);
});

test('rejects duplicate IDs in each referenced collection', () => {
  invalid(data => { data.cities.push(structuredClone(data.cities[0]!)); }, /duplicate identifier/);
  invalid(data => { data.venues.push(structuredClone(data.venues[0]!)); }, /duplicate identifier/);
  invalid(data => { data.tour.shows[1].id = data.tour.shows[0].id; }, /duplicate identifier/);
  invalid(data => { data.repairCandidates[1]!.id = data.repairCandidates[0]!.id; }, /duplicate identifier/);
});

test('validates city and venue references, including membership in the selected city', () => {
  invalid(data => { data.venues[0]!.cityId = 'missing-city'; }, /unknown referenced identifier missing-city/);
  invalid(data => { data.tour.shows[0].cityId = 'missing-city'; }, /unknown referenced identifier missing-city/);
  invalid(data => { data.tour.shows[0].venueId = 'missing-venue'; }, /unknown referenced identifier missing-venue/);
  invalid(data => { data.tour.shows[0].venueId = data.venues[1]!.id; }, /venue must belong to the show city/);
  invalid(data => { data.roadMatrix.legs[0]!.fromCityId = 'missing-origin'; }, /unknown referenced identifier missing-origin/);
  invalid(data => { data.roadMatrix.legs[0]!.toCityId = 'missing-destination'; }, /unknown referenced identifier missing-destination/);
});

test('requires one candidate of each kind, all referencing the cancelled show', () => {
  invalid(data => { data.repairCandidates.pop(); }, /exactly three candidates/);
  invalid(data => { Object.assign(data.repairCandidates[1]!, { kind: 'replacement' }); }, /exactly three candidates/);
  invalid(data => { data.repairCandidates[0]!.cancelledShowId = 'show-1'; }, /one cancelled show/);
  invalid(data => { data.repairCandidates[2]!.cancelledShowId = 'missing-show'; }, /one cancelled show/);
  invalid(data => { Object.assign(data.repairCandidates[2]!, { venueId: 'venue-pl-radom' }); }, /day-off candidate must not contain/);
});

test('candidate references and distinct cities/venues are checked', () => {
  invalid(data => { Object.assign(data.repairCandidates[0]!, { cityId: 'missing-city' }); }, /unknown referenced identifier/);
  invalid(data => { Object.assign(data.repairCandidates[0]!, { venueId: 'missing-venue' }); }, /unknown referenced identifier/);
  invalid(data => { Object.assign(data.repairCandidates[0]!, { venueId: 'venue-pl-kielce' }); }, /venue must belong to the candidate city/);
  invalid(data => {
    Object.assign(data.repairCandidates[1]!, { cityId: 'pl-radom', venueId: 'venue-pl-radom' });
  }, /distinct cities and venues/);
  invalid(data => {
    Object.assign(data.repairCandidates[0]!, { cityId: 'pl-warsaw', venueId: 'venue-pl-warsaw' });
  }, /differ from the cancelled venue/);
});

test('a new venue in the cancelled city is a legitimate supplied replacement', () => {
  const data = input();
  Object.assign(data.repairCandidates[0]!, { cityId: 'pl-warsaw' });
  data.venues.find(venue => venue.id === 'venue-pl-radom')!.cityId = 'pl-warsaw';
  assert.doesNotThrow(() => parseTourScenario(data));
});

test('replacement schedules preserve both instants and declared zones', () => {
  invalid(data => {
    const candidate = data.repairCandidates[0]!;
    assert.notEqual(candidate.kind, 'day-off');
    if (candidate.kind !== 'day-off') candidate.schedule.arriveBy.iso = '2026-11-12T17:00:00+01:00';
  }, /preserve the cancelled schedule/);
  invalid(data => {
    const candidate = data.repairCandidates[0]!;
    if (candidate.kind !== 'day-off') candidate.schedule.startsAt.timeZone = 'Europe/Berlin';
  }, /preserve the cancelled schedule/);
});

test('distance and duration values are safe integer units without coercion', () => {
  for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '100', null]) {
    invalid(data => {
      Object.assign(data.roadMatrix.legs[0]!, { travel: { status: 'known', value: { distanceMetres: bad, durationSeconds: 1 } } });
    }, /distanceMetres.*safe integer/);
    invalid(data => {
      Object.assign(data.roadMatrix.legs[0]!, { travel: { status: 'known', value: { distanceMetres: 1, durationSeconds: bad } } });
    }, /durationSeconds.*safe integer/);
  }
  for (const bad of [0, -1, 1.5, 86401, Infinity]) {
    invalid(data => { data.tour.constraints.maxDailyDrivingSeconds = bad; }, /maxDailyDrivingSeconds.*safe integer/);
  }
  invalid(data => { data.tour.constraints.minimumMarketSpacingMetres = -1; }, /minimumMarketSpacingMetres.*safe integer/);
});

test('money is nonnegative integer minor units with an explicit uppercase currency', () => {
  for (const currency of ['pln', 'PL', 'PLNN', ' PLN', '€€€']) {
    invalid(data => { data.venues[0]!.fee = { status: 'known', value: { currency, minorUnits: 100 } }; }, /currency/);
  }
  for (const minorUnits of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    invalid(data => { data.venues[0]!.fee = { status: 'known', value: { currency: 'PLN', minorUnits } }; }, /minorUnits.*safe integer/);
  }
  const data = input();
  data.venues[0]!.fee = { status: 'known', value: { currency: 'PLN', minorUnits: 0 } };
  assert.doesNotThrow(() => parseTourScenario(data));
});

test('known capacity is positive and availability has a valid date, zone and boolean', () => {
  for (const value of [0, -1, 1.5]) {
    invalid(data => { data.venues[0]!.capacityPeople = { status: 'known', value }; }, /capacityPeople.*safe integer/);
  }
  invalid(data => {
    data.venues[0]!.availability = { status: 'known', value: { localDate: '2026-02-30', timeZone: 'Europe/Warsaw', available: true } };
  }, /valid calendar date/);
  invalid(data => {
    data.venues[0]!.availability = { status: 'known', value: { localDate: '2026-11-10', timeZone: 'Not/AZone', available: true } };
  }, /IANA/);
  invalid(data => {
    Object.assign(data.venues[0]!, { availability: { status: 'known', value: { localDate: '2026-11-10', timeZone: 'Europe/Warsaw', available: 'yes' } } });
  }, /available.*boolean/);
});

test('knowledge requires the correct tagged shape and explicit nonempty unknown reasons', () => {
  invalid(data => { data.venues[0]!.fee = { status: 'unknown', reason: ' ' }; }, /reason.*non-empty string/);
  invalid(data => { Object.assign(data.venues[0]!, { fee: { status: 'known' } }); }, /fee.value.*object/);
  invalid(data => { Object.assign(data.venues[0]!, { fee: { status: 'unknown', reason: 'No quote', value: 0 } }); }, /must contain only/);
  invalid(data => { Object.assign(data.venues[0]!, { fee: { status: 'pending' } }); }, /status/);
});

test('matrix is directed, unique per ordered pair and explicit about source and quality', () => {
  invalid(data => { Object.assign(data.roadMatrix, { directed: false }); }, /reverse legs are not inferred/);
  invalid(data => { data.roadMatrix.legs.push(structuredClone(data.roadMatrix.legs[0]!)); }, /duplicate directed road leg/);
  invalid(data => { Object.assign(data.roadMatrix.legs[0]!, { quality: 'haversine-verified' }); }, /quality/);
  invalid(data => { Object.assign(data.roadMatrix.provenance, { method: 'haversine' }); }, /provenance.method/);
  invalid(data => { data.roadMatrix.provenance.source = ''; }, /provenance.source.*non-empty string/);
  const parsed = parseTourScenario(input());
  assert.notDeepEqual(parsed.roadMatrix.legs[0]?.travel, parsed.roadMatrix.legs[1]?.travel);
});

test('road quality cannot contradict estimate provenance, while unknown OSRM recording time remains valid', () => {
  for (const method of ['manual-estimate', 'synthetic-fixture'] as const) {
    invalid(data => {
      data.roadMatrix.provenance.method = method;
      data.roadMatrix.legs[0]!.quality = 'recorded-road';
    }, /quality.*recorded-road contradicts/);
  }
  for (const method of ['osrm-table', 'osrm-route'] as const) {
    const data = input();
    data.roadMatrix.provenance.method = method;
    data.roadMatrix.legs[0]!.quality = 'recorded-road';
    const parsed = parseTourScenario(data);
    assert.equal(parsed.roadMatrix.provenance.recordedAt.status, 'unknown');
    assert.equal(parsed.roadMatrix.legs[0]!.quality, 'recorded-road');
  }
});

test('sparse or wholly unknown matrix evidence is valid input, never fabricated completeness', () => {
  const data = input();
  data.roadMatrix.legs = [{ ...data.roadMatrix.legs[0]!, travel: { status: 'unknown', reason: 'No directed road recording' } }];
  const parsed = parseTourScenario(data);
  assert.equal(parsed.roadMatrix.legs.length, 1);
  assert.deepEqual(parsed.roadMatrix.legs[0]?.travel, { status: 'unknown', reason: 'No directed road recording' });
  data.roadMatrix.legs = [];
  assert.equal(parseTourScenario(data).roadMatrix.legs.length, 0);
});

test('strict ISO timestamps reject rollovers, implicit offsets and malformed clock values', () => {
  for (const iso of [
    '2026-02-30T12:00:00+01:00', '2025-02-29T12:00:00+01:00', '2026-04-31T12:00:00+02:00',
    '2026-11-10T24:00:00+01:00', '2026-11-10T12:60:00+01:00', '2026-11-10T12:00:60+01:00',
    '2026-11-10T12:00:00', '2026-11-10T12:00:00Z', '2026-11-10T12:00+01:00',
    '2026-11-10T12:00:00.123+01:00', '2026-11-10T12:00:00+24:00',
  ]) assert.throws(() => parseZonedDateTime(at(iso)), ScenarioInputError, iso);
  assert.deepEqual(parseZonedDateTime(at('2024-02-29T12:00:00+01:00')), at('2024-02-29T12:00:00+01:00'));
});

test('IANA zones are explicit and offset/zone agreement includes DST gaps and folds', () => {
  for (const zone of ['Not/AZone', '+01:00', '', ' Europe/Warsaw']) {
    assert.throws(() => assertTimeZone(zone), ScenarioInputError);
  }
  assert.throws(() => parseZonedDateTime(at('2026-11-10T12:00:00+02:00')), /including DST/);
  assert.throws(() => parseZonedDateTime(at('2026-03-29T02:30:00+01:00')), /including DST/);
  assert.throws(() => parseZonedDateTime(at('2026-03-29T02:30:00+02:00')), /including DST/);
  const first = epochSeconds(at('2026-10-25T02:30:00+02:00'));
  const second = epochSeconds(at('2026-10-25T02:30:00+01:00'));
  assert.equal(second - first, 3600);
});

test('calendar conversion depends on the requested zone, not the host zone', () => {
  const value = epochSeconds(at('2026-11-10T00:30:00+01:00'));
  assert.equal(localDateAt(value, 'Europe/Warsaw'), '2026-11-10');
  assert.equal(localDateAt(value, 'Etc/UTC'), '2026-11-09');
  assert.throws(() => localDateAt(value + 0.5, 'Etc/UTC'), /integer number of seconds/);
});

test('next local midnight is strictly future and respects 23-hour and 25-hour days', () => {
  const spring = epochSeconds(at('2026-03-29T00:00:00+01:00'));
  const autumn = epochSeconds(at('2026-10-25T00:00:00+02:00'));
  assert.equal(nextLocalMidnight(spring, 'Europe/Warsaw') - spring, 23 * 3600);
  assert.equal(nextLocalMidnight(autumn, 'Europe/Warsaw') - autumn, 25 * 3600);
  assert.equal(nextLocalMidnight(spring, 'Europe/Warsaw'), epochSeconds(at('2026-03-30T00:00:00+02:00')));
  const lastSecond = epochSeconds(at('2026-11-10T23:59:59+01:00'));
  assert.equal(nextLocalMidnight(lastSecond, 'Europe/Warsaw'), lastSecond + 1);
});

test('a skipped midnight or calendar date uses the next valid local-day boundary', () => {
  const saoPaulo = epochSeconds(at('2018-11-03T12:00:00-03:00', 'America/Sao_Paulo'));
  assert.equal(nextLocalMidnight(saoPaulo, 'America/Sao_Paulo'), epochSeconds(at('2018-11-04T01:00:00-02:00', 'America/Sao_Paulo')));
  const apia = epochSeconds(at('2011-12-29T00:00:00-10:00', 'Pacific/Apia'));
  assert.equal(nextLocalMidnight(apia, 'Pacific/Apia'), epochSeconds(at('2011-12-31T00:00:00+14:00', 'Pacific/Apia')));
});
