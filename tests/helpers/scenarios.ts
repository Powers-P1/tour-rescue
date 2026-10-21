import { readFileSync } from 'node:fs';
import type { TourScenario } from '../../src/core/domain.ts';
import { parseTourScenario } from '../../src/core/parse-scenario.ts';
import { parseOsrmMatrix } from '../../src/core/parse-osrm-matrix.ts';

export type Mutable<T> = { -readonly [P in keyof T]: Mutable<T[P]> };

export function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8'));
}

export function polishScenario(): Mutable<TourScenario> {
  return parseTourScenario(fixture('synthetic/tour__five-dates__one-cancelled.json')) as Mutable<TourScenario>;
}

/** Test-only fictional booking inputs; the maintained road snapshot stays intact. */
export function germanyScenario(): Mutable<TourScenario> {
  const catalogue = fixture('cities_de.json') as {
    cities: { id: string; name: string; country: string }[];
  };
  const unknown = (reason: string) => ({ status: 'unknown', reason });
  const schedule = (day: number) => Object.fromEntries([
    ['arriveBy', 16], ['startsAt', 20], ['endsAt', 22], ['departAfter', 23],
  ].map(([key, hour]) => [key, {
    iso: `2026-11-${day}T${hour}:00:00+01:00`, timeZone: 'Europe/Berlin',
  }]));
  const shows = ['de-hamburg', 'de-berlin', 'de-leipzig', 'de-munich', 'de-cologne']
    .map((cityId, index) => ({
      id: `show-${index + 1}`, cityId, venueId: `venue-${cityId}`, schedule: schedule(10 + index * 2),
      ...(index === 2 ? { status: 'cancelled', locked: false, reason: 'Fictional closure.' } :
        { status: 'confirmed', locked: true }),
    }));
  const scenario = {
    schemaVersion: 1, id: 'germany-five-dates-test', dataKind: 'synthetic',
    description: 'Fictional shows and booking facts using the maintained directed Germany road snapshot.',
    cities: catalogue.cities.map(city => ({
      id: city.id, name: city.name, countryCode: city.country, timeZone: 'Europe/Berlin',
      qlooEntityId: unknown('No Qloo identity resolution is represented by this synthetic scenario.'),
    })),
    venues: catalogue.cities.map(city => ({
      id: `venue-${city.id}`, cityId: city.id, name: `Fictional ${city.name} venue`,
      qlooEntityId: unknown('Fictional venue; not a Qloo entity.'),
      availability: { status: 'known', value: {
        localDate: '2026-11-14', timeZone: 'Europe/Berlin', available: true,
      } },
      capacityPeople: unknown('No attendance or capacity requirement is supplied.'),
      fee: { status: 'known', value: { currency: 'EUR', minorUnits: 50000 } },
      promoterTerms: unknown('No promoter agreement is represented.'),
    })),
    roadMatrix: parseOsrmMatrix(fixture('osrm_matrix_de.json')),
    tour: {
      id: 'tour-de', name: 'The Harbour Lights synthetic tour', region: 'Germany', shows,
      constraints: {
        drivingDayTimeZone: 'Europe/Berlin', maxDailyDrivingSeconds: 21600,
        minimumMarketSpacingMetres: 150000, marketSpacingMeasure: 'road-distance',
        additionalBudget: { status: 'known', value: { currency: 'EUR', minorUnits: 100000 } },
      },
    },
    repairCandidates: [
      { id: 'replacement-nuremberg', kind: 'replacement', cancelledShowId: 'show-3',
        cityId: 'de-nuremberg', venueId: 'venue-de-nuremberg', schedule: schedule(14) },
      { id: 'detour-frankfurt', kind: 'detour', cancelledShowId: 'show-3',
        cityId: 'de-frankfurt', venueId: 'venue-de-frankfurt', schedule: schedule(14) },
      { id: 'day-off', kind: 'day-off', cancelledShowId: 'show-3' },
    ],
  };
  return parseTourScenario(scenario) as Mutable<TourScenario>;
}

export function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
}
