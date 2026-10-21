import type {
  City, DirectedRoadLeg, FiveShowTour, Knowledge, Money, RepairCandidate,
  RoadMatrix, RouteConstraints, ShowRepairCandidate, ShowSchedule, Tour,
  TourScenario, TourShow, Venue, VenueAvailability,
} from './domain.ts';
import { assertTimeZone, epochSeconds, parseZonedDateTime, ScenarioInputError } from './time.ts';

export { ScenarioInputError } from './time.ts';

type RecordValue = Record<string, unknown>;
type Reader<T> = (value: unknown, path: string) => T;

function record(value: unknown, path: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ScenarioInputError(path, 'must be an object');
  }
  return value as RecordValue;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ScenarioInputError(path, 'must be a non-empty string');
  }
  return value;
}

function integer(value: unknown, path: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ScenarioInputError(path, `must be a safe integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ScenarioInputError(path, `must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function list<T>(value: unknown, path: string, read: Reader<T>): T[] {
  if (!Array.isArray(value)) throw new ScenarioInputError(path, 'must be an array');
  // Array.from visits sparse entries as undefined, so holes cannot bypass validation.
  return Array.from(value, (item: unknown, index: number) => read(item, `${path}[${index}]`));
}

function zone(value: unknown, path: string): string {
  const result = text(value, path);
  assertTimeZone(result, path);
  return result;
}

function knowledge<T>(value: unknown, path: string, read: Reader<T>): Knowledge<T> {
  const row = record(value, path);
  const status = oneOf(row.status, ['known', 'unknown'], `${path}.status`);
  const allowed = status === 'known' ? ['status', 'value'] : ['status', 'reason'];
  if (Object.keys(row).some(key => !allowed.includes(key))) {
    throw new ScenarioInputError(path, `a ${status} value must contain only ${allowed.join(' and ')}`);
  }
  if (status === 'known') return { status, value: read(row.value, `${path}.value`) };
  return { status, reason: text(row.reason, `${path}.reason`) };
}

function money(value: unknown, path: string): Money {
  const row = record(value, path);
  const currency = text(row.currency, `${path}.currency`);
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ScenarioInputError(`${path}.currency`, 'must be a three-letter uppercase currency code');
  }
  return { currency, minorUnits: integer(row.minorUnits, `${path}.minorUnits`) };
}

function localDate(value: unknown, path: string): string {
  const result = text(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  if (match === null) throw new ScenarioInputError(path, 'must use the local date format YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new ScenarioInputError(path, 'must be a valid calendar date; rollover is not allowed');
  }
  return result;
}

function availability(value: unknown, path: string): VenueAvailability {
  const row = record(value, path);
  if (typeof row.available !== 'boolean') throw new ScenarioInputError(`${path}.available`, 'must be a boolean');
  return {
    localDate: localDate(row.localDate, `${path}.localDate`),
    timeZone: zone(row.timeZone, `${path}.timeZone`),
    available: row.available,
  };
}

function city(value: unknown, path: string): City {
  const row = record(value, path);
  const countryCode = text(row.countryCode, `${path}.countryCode`);
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new ScenarioInputError(`${path}.countryCode`, 'must be a two-letter uppercase country code');
  }
  return {
    id: text(row.id, `${path}.id`), name: text(row.name, `${path}.name`), countryCode,
    timeZone: zone(row.timeZone, `${path}.timeZone`),
    qlooEntityId: knowledge(row.qlooEntityId, `${path}.qlooEntityId`, text),
  };
}

function venue(value: unknown, path: string): Venue {
  const row = record(value, path);
  return {
    id: text(row.id, `${path}.id`), cityId: text(row.cityId, `${path}.cityId`),
    name: text(row.name, `${path}.name`),
    qlooEntityId: knowledge(row.qlooEntityId, `${path}.qlooEntityId`, text),
    availability: knowledge(row.availability, `${path}.availability`, availability),
    capacityPeople: knowledge(row.capacityPeople, `${path}.capacityPeople`, (item, itemPath) => integer(item, itemPath, 1)),
    fee: knowledge(row.fee, `${path}.fee`, money),
    promoterTerms: knowledge(row.promoterTerms, `${path}.promoterTerms`, text),
  };
}

const scheduleKeys = ['arriveBy', 'startsAt', 'endsAt', 'departAfter'] as const;

function schedule(value: unknown, path: string): ShowSchedule {
  const row = record(value, path);
  const result: ShowSchedule = {
    arriveBy: parseZonedDateTime(row.arriveBy, `${path}.arriveBy`),
    startsAt: parseZonedDateTime(row.startsAt, `${path}.startsAt`),
    endsAt: parseZonedDateTime(row.endsAt, `${path}.endsAt`),
    departAfter: parseZonedDateTime(row.departAfter, `${path}.departAfter`),
  };
  const arrive = epochSeconds(result.arriveBy);
  const start = epochSeconds(result.startsAt);
  const end = epochSeconds(result.endsAt);
  const depart = epochSeconds(result.departAfter);
  if (!(arrive <= start && start < end && end <= depart)) {
    throw new ScenarioInputError(path, 'must satisfy arriveBy <= startsAt < endsAt <= departAfter');
  }
  return result;
}

function show(value: unknown, path: string): TourShow {
  const row = record(value, path);
  const status = oneOf(row.status, ['confirmed', 'cancelled'], `${path}.status`);
  const common = {
    id: text(row.id, `${path}.id`), cityId: text(row.cityId, `${path}.cityId`),
    venueId: text(row.venueId, `${path}.venueId`), schedule: schedule(row.schedule, `${path}.schedule`),
  };
  if (status === 'confirmed') {
    if (row.locked !== true) throw new ScenarioInputError(`${path}.locked`, 'confirmed shows must remain locked');
    return { ...common, status, locked: true };
  }
  if (row.locked !== false) throw new ScenarioInputError(`${path}.locked`, 'the cancelled show must not be locked');
  return { ...common, status, locked: false, reason: text(row.reason, `${path}.reason`) };
}

function constraints(value: unknown, path: string): RouteConstraints {
  const row = record(value, path);
  return {
    drivingDayTimeZone: zone(row.drivingDayTimeZone, `${path}.drivingDayTimeZone`),
    maxDailyDrivingSeconds: integer(row.maxDailyDrivingSeconds, `${path}.maxDailyDrivingSeconds`, 1, 86400),
    minimumMarketSpacingMetres: integer(row.minimumMarketSpacingMetres, `${path}.minimumMarketSpacingMetres`),
    marketSpacingMeasure: oneOf(row.marketSpacingMeasure, ['road-distance'], `${path}.marketSpacingMeasure`),
    additionalBudget: knowledge(row.additionalBudget, `${path}.additionalBudget`, money),
  };
}

function tour(value: unknown, path: string): Tour {
  const row = record(value, path);
  const shows = list(row.shows, `${path}.shows`, show);
  if (shows.length !== 5) throw new ScenarioInputError(`${path}.shows`, 'must contain exactly five shows');
  if (shows.filter(item => item.status === 'cancelled').length !== 1) {
    throw new ScenarioInputError(`${path}.shows`, 'must contain exactly one cancelled show and four locked confirmed shows');
  }
  for (let index = 1; index < shows.length; index += 1) {
    if (epochSeconds(shows[index - 1]!.schedule.departAfter) > epochSeconds(shows[index]!.schedule.arriveBy)) {
      throw new ScenarioInputError(`${path}.shows[${index}].schedule`, 'shows must be ascending and nonoverlapping: previous departAfter <= next arriveBy');
    }
  }
  return {
    id: text(row.id, `${path}.id`), name: text(row.name, `${path}.name`), region: text(row.region, `${path}.region`),
    shows: shows as unknown as FiveShowTour,
    constraints: constraints(row.constraints, `${path}.constraints`),
  };
}

function leg(value: unknown, path: string): DirectedRoadLeg {
  const row = record(value, path);
  return {
    fromCityId: text(row.fromCityId, `${path}.fromCityId`),
    toCityId: text(row.toCityId, `${path}.toCityId`),
    quality: oneOf(row.quality, ['recorded-road', 'estimate'], `${path}.quality`),
    travel: knowledge(row.travel, `${path}.travel`, (item, itemPath) => {
      const travel = record(item, itemPath);
      return {
        distanceMetres: integer(travel.distanceMetres, `${itemPath}.distanceMetres`),
        durationSeconds: integer(travel.durationSeconds, `${itemPath}.durationSeconds`),
      };
    }),
  };
}

function matrix(value: unknown, path: string): RoadMatrix {
  const row = record(value, path);
  if (row.directed !== true) throw new ScenarioInputError(`${path}.directed`, 'must be true; reverse legs are not inferred');
  const provenance = record(row.provenance, `${path}.provenance`);
  const result: RoadMatrix = {
    id: text(row.id, `${path}.id`), directed: true,
    provenance: {
      source: text(provenance.source, `${path}.provenance.source`),
      method: oneOf(provenance.method, ['osrm-table', 'osrm-route', 'manual-estimate', 'synthetic-fixture'], `${path}.provenance.method`),
      recordedAt: knowledge(provenance.recordedAt, `${path}.provenance.recordedAt`, parseZonedDateTime),
      description: text(provenance.description, `${path}.provenance.description`),
    },
    legs: list(row.legs, `${path}.legs`, leg),
  };
  if (result.provenance.method === 'manual-estimate' || result.provenance.method === 'synthetic-fixture') {
    result.legs.forEach((item, index) => {
      if (item.quality === 'recorded-road') {
        throw new ScenarioInputError(`${path}.legs[${index}].quality`, `recorded-road contradicts the ${result.provenance.method} provenance method`);
      }
    });
  }
  return result;
}

function candidate(value: unknown, path: string): RepairCandidate {
  const row = record(value, path);
  const kind = oneOf(row.kind, ['replacement', 'detour', 'day-off'], `${path}.kind`);
  const common = { id: text(row.id, `${path}.id`), cancelledShowId: text(row.cancelledShowId, `${path}.cancelledShowId`) };
  if (kind === 'day-off') {
    if (['cityId', 'venueId', 'schedule'].some(key => Object.hasOwn(row, key))) {
      throw new ScenarioInputError(path, 'a day-off candidate must not contain a replacement city, venue or schedule');
    }
    return { ...common, kind };
  }
  return {
    ...common, kind, cityId: text(row.cityId, `${path}.cityId`), venueId: text(row.venueId, `${path}.venueId`),
    schedule: schedule(row.schedule, `${path}.schedule`),
  };
}

function unique<T extends { readonly id: string }>(items: readonly T[], path: string): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  items.forEach((item, index) => {
    if (result.has(item.id)) throw new ScenarioInputError(`${path}[${index}].id`, `duplicate identifier ${item.id}`);
    result.set(item.id, item);
  });
  return result;
}

function reference<T>(items: ReadonlyMap<string, T>, id: string, path: string): T {
  const result = items.get(id);
  if (result === undefined) throw new ScenarioInputError(path, `unknown referenced identifier ${id}`);
  return result;
}

/** Copy and validate application data; no API inference, mutation or clock access. */
export function parseTourScenario(value: unknown): TourScenario {
  const row = record(value, 'scenario');
  if (row.schemaVersion !== 1) throw new ScenarioInputError('scenario.schemaVersion', 'must be 1');
  const result: TourScenario = {
    schemaVersion: 1, id: text(row.id, 'scenario.id'),
    dataKind: oneOf(row.dataKind, ['synthetic', 'user-supplied'], 'scenario.dataKind'),
    description: text(row.description, 'scenario.description'),
    tour: tour(row.tour, 'scenario.tour'),
    cities: list(row.cities, 'scenario.cities', city),
    venues: list(row.venues, 'scenario.venues', venue),
    roadMatrix: matrix(row.roadMatrix, 'scenario.roadMatrix'),
    repairCandidates: list(row.repairCandidates, 'scenario.repairCandidates', candidate),
  };
  const cities = unique(result.cities, 'scenario.cities');
  const venues = unique(result.venues, 'scenario.venues');
  unique(result.tour.shows, 'scenario.tour.shows');
  unique(result.repairCandidates, 'scenario.repairCandidates');
  result.venues.forEach((item, index) => reference(cities, item.cityId, `scenario.venues[${index}].cityId`));
  result.tour.shows.forEach((item, index) => {
    const path = `scenario.tour.shows[${index}]`;
    reference(cities, item.cityId, `${path}.cityId`);
    if (reference(venues, item.venueId, `${path}.venueId`).cityId !== item.cityId) {
      throw new ScenarioInputError(`${path}.venueId`, 'venue must belong to the show city');
    }
  });
  const directedPairs = new Set<string>();
  result.roadMatrix.legs.forEach((item, index) => {
    const path = `scenario.roadMatrix.legs[${index}]`;
    reference(cities, item.fromCityId, `${path}.fromCityId`);
    reference(cities, item.toCityId, `${path}.toCityId`);
    const key = JSON.stringify([item.fromCityId, item.toCityId]);
    if (directedPairs.has(key)) throw new ScenarioInputError(path, 'duplicate directed road leg');
    directedPairs.add(key);
  });
  if (result.repairCandidates.length !== 3
      || new Set(result.repairCandidates.map(item => item.kind)).size !== 3) {
    throw new ScenarioInputError('scenario.repairCandidates', 'must contain exactly three candidates: one replacement, one detour and one day-off');
  }
  const cancelled = result.tour.shows.find(item => item.status === 'cancelled')!;
  const replacements: ShowRepairCandidate[] = [];
  result.repairCandidates.forEach((item, index) => {
    const path = `scenario.repairCandidates[${index}]`;
    if (item.cancelledShowId !== cancelled.id) {
      throw new ScenarioInputError(`${path}.cancelledShowId`, 'must reference the one cancelled show');
    }
    if (item.kind === 'day-off') return;
    reference(cities, item.cityId, `${path}.cityId`);
    if (reference(venues, item.venueId, `${path}.venueId`).cityId !== item.cityId) {
      throw new ScenarioInputError(`${path}.venueId`, 'venue must belong to the candidate city');
    }
    if (item.venueId === cancelled.venueId) {
      throw new ScenarioInputError(`${path}.venueId`, 'replacement venue must differ from the cancelled venue');
    }
    for (const key of scheduleKeys) {
      const actual = item.schedule[key];
      const expected = cancelled.schedule[key];
      if (actual.timeZone !== expected.timeZone || epochSeconds(actual) !== epochSeconds(expected)) {
        throw new ScenarioInputError(`${path}.schedule.${key}`, 'must preserve the cancelled schedule instant and declared time zone');
      }
    }
    replacements.push(item);
  });
  if (replacements[0]!.cityId === replacements[1]!.cityId || replacements[0]!.venueId === replacements[1]!.venueId) {
    throw new ScenarioInputError('scenario.repairCandidates', 'replacement and detour must have distinct cities and venues');
  }
  return result;
}
