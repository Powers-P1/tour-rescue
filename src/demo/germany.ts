import cityCatalogue from '../../fixtures/cities_de.json' with { type: 'json' };
import roadSnapshot from '../../fixtures/osrm_matrix_de.json' with { type: 'json' };
import heatmapFixture from '../../fixtures/qloo/heatmap_de_synthetic.json' with { type: 'json' };
import policyFixture from '../../fixtures/synthetic/decision__germany__policy.json' with { type: 'json' };
import controlFixture from '../../fixtures/synthetic/fit__germany__control.json' with { type: 'json' };
import type { TourScenario } from '../core/domain.ts';
import type { FitInput } from '../core/fit-types.ts';
import type { QueryEvidence } from '../core/evidence-types.ts';
import { parseTourScenario } from '../core/parse-scenario.ts';
import { parseOsrmMatrix } from '../core/parse-osrm-matrix.ts';
import { parseScenarioFitInput, parseSyntheticHeatmapFitInput } from '../core/scenario-fit.ts';
import { parseDecisionPolicy } from '../core/decision.ts';
import { parseBreakpointRanges } from '../core/breakpoint.ts';

export const GERMANY_SCENARIO_ID = 'germany-five-dates-v1';
/** Bounded box around the scenario cities; this is not an administrative Germany polygon. */
export const GERMANY_REGION_WKT = 'POLYGON((5.5 47,15.5 47,15.5 55.2,5.5 55.2,5.5 47))';

/** Fictional booking facts; both demo and offline tests use the same maintained road snapshot. */
export function createGermanyScenario(): TourScenario {
  const catalogue = cityCatalogue as {
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
    schemaVersion: 1, id: GERMANY_SCENARIO_ID, dataKind: 'synthetic',
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
    roadMatrix: parseOsrmMatrix(roadSnapshot),
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
  return parseTourScenario(scenario);
}


export function germanyDemoInputs() {
  const fitInput = parseSyntheticHeatmapFitInput(heatmapFixture);
  const controlFitInput = parseScenarioFitInput({
    ...fitInput,
    profiles: fitInput.profiles.map(profile => profile.role === 'target' ? controlFixture.profile : profile),
  });
  return {
    scenario: createGermanyScenario(), fitInput, controlFitInput,
    policy: parseDecisionPolicy(policyFixture.policy), ranges: parseBreakpointRanges(policyFixture.ranges),
    artists: {
      target: { id: fitInput.profiles.find(profile => profile.role === 'target')!.artistId,
        name: heatmapFixture.queries.find(query => query.role === 'main')!.label },
      comparisons: heatmapFixture.queries.filter(query => query.role === 'comparison')
        .map(query => ({ id: query.queryId, name: query.label })),
      control: { id: controlFixture.profile.artistId, name: controlFixture.label },
    },
  };
}

/** Evaluation timestamps describe fixture use; there was no upstream HTTP request. */
export function syntheticQueryEvidence(inputs: readonly FitInput[], evaluatedAt: string): QueryEvidence[] {
  const profiles = new Map(inputs.flatMap(input => input.profiles).map(profile => [profile.queryId, profile]));
  return [...profiles.values()].map(profile => ({
    queryId: profile.queryId, operation: 'artist-heatmap', endpoint: '/v2/insights',
    parameters: { 'filter.type': 'urn:heatmap', 'signal.interests.entities': profile.artistId,
      'filter.location': GERMANY_REGION_WKT, 'output.heatmap.boundary': 'urn:geohash' },
    startedAt: evaluatedAt, completedAt: evaluatedAt, source: 'synthetic', status: 'success',
    httpStatus: { status: 'unknown', reason: 'Synthetic fixture; no HTTP request was made.' },
    responseReference: { status: 'unknown', reason: 'No upstream response exists; provenance names the public synthetic fixture.' },
    responseRecordedAt: { status: 'unknown', reason: 'Synthetic evidence has no live acquisition timestamp.' },
    warnings: [{ code: 'SYNTHETIC_NO_REQUEST', queryId: profile.queryId,
      message: 'Fixture evaluated locally; artist affinities and booking facts are fictional.' }],
  }));
}
