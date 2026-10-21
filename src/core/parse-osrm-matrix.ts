import type { DirectedRoadLeg, RoadMatrix, ZonedDateTime } from './domain.ts';
import { epochSeconds, parseZonedDateTime, ScenarioInputError } from './time.ts';

function fail(path: string, message: string): never {
  throw new ScenarioInputError(path, message);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(path, 'expected an object');
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, 'expected an array');
  return value as unknown[];
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(path, 'expected a non-empty string');
  }
  return value;
}

/** The fixture records an instant, which we normalize to the explicit UTC zone. */
function recordedAt(value: unknown): ZonedDateTime {
  const path = 'metadata.retrieved_at';
  const timestamp = string(value, path);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(Z|([+-])(\d{2}):(\d{2}))$/.exec(timestamp);
  if (match === null) {
    return fail(path, 'expected an ISO instant with seconds and Z or an explicit numeric offset');
  }
  // Validate the unshifted calendar first: Date.parse alone accepts date rollover.
  const wall = parseZonedDateTime({ iso: `${match[1]}+00:00`, timeZone: 'Etc/UTC' }, path);
  const hours = match[4] === undefined ? 0 : Number(match[4]);
  const minutes = match[5] === undefined ? 0 : Number(match[5]);
  if (hours > 23 || minutes > 59) return fail(path, 'contains an invalid numeric offset');
  const offset = (match[3] === '-' ? -1 : 1) * (hours * 3600 + minutes * 60);
  const iso = new Date((epochSeconds(wall) - offset) * 1000).toISOString().replace('.000Z', '+00:00');
  return parseZonedDateTime({ iso, timeZone: 'Etc/UTC' }, path);
}

function matrix(value: unknown, size: number, path: string): (number | null)[][] {
  const rows = array(value, path);
  if (rows.length !== size) return fail(path, `expected exactly ${size} rows`);
  return Array.from(rows, (value, i) => {
    const rowPath = `${path}[${i}]`;
    const cells = array(value, rowPath);
    if (cells.length !== size) return fail(rowPath, `expected exactly ${size} columns`);
    return Array.from(cells, (cell, j) => {
      if (cell === null) return null;
      if (typeof cell !== 'number' || !Number.isSafeInteger(cell) || cell < 0) {
        return fail(`${rowPath}[${j}]`, 'expected a non-negative safe integer or null (no coercion)');
      }
      return cell;
    });
  });
}

/**
 * Parses our maintained, frozen OSRM fixture envelope, not the raw OSRM response.
 * Every directed cell is retained, including zero diagonals and explicit unknowns.
 * "recorded-road" identifies recorded road-model data, not a travel-time guarantee.
 */
export function parseOsrmMatrix(value: unknown): RoadMatrix {
  const input = object(value, 'osrmMatrix');
  if (input.schemaVersion !== 1) fail('schemaVersion', 'expected 1');
  if (input.dataKind !== 'derived-routing') fail('dataKind', 'expected derived-routing');
  const id = string(input.id, 'id');
  const metadata = object(input.metadata, 'metadata');
  if (metadata.directional !== true) fail('metadata.directional', 'must explicitly be true');
  const units = object(metadata.units, 'metadata.units');
  if (units.durations !== 'seconds (integer)') fail('metadata.units.durations', 'expected seconds (integer)');
  if (units.distances !== 'metres (integer)') fail('metadata.units.distances', 'expected metres (integer)');
  const source = string(metadata.source, 'metadata.source');
  const note = string(metadata.note, 'metadata.note');
  const timestamp = recordedAt(metadata.retrieved_at);
  const cityIds = Array.from(array(input.cityIds, 'cityIds'), (city, i) => string(city, `cityIds[${i}]`));
  if (cityIds.length === 0) fail('cityIds', 'must not be empty');
  if (new Set(cityIds).size !== cityIds.length) fail('cityIds', 'duplicate identifier');
  const durations = matrix(input.durations, cityIds.length, 'durations');
  const distances = matrix(input.distances, cityIds.length, 'distances');
  const legs: DirectedRoadLeg[] = [];
  cityIds.forEach((fromCityId, i) => {
    cityIds.forEach((toCityId, j) => {
      const durationSeconds = durations[i]?.[j];
      const distanceMetres = distances[i]?.[j];
      if (durationSeconds === undefined || distanceMetres === undefined) {
        throw new Error('Validated matrix dimensions invariant violated');
      }
      if ((durationSeconds === null) !== (distanceMetres === null)) {
        fail(`durations[${i}][${j}]/distances[${i}][${j}]`, 'duration and distance must both be available or both be null');
      }
      legs.push({
        fromCityId, toCityId, quality: 'recorded-road',
        travel: durationSeconds === null || distanceMetres === null
          ? { status: 'unknown', reason: `OSRM snapshot has no recorded duration or distance for ${fromCityId} -> ${toCityId}; no travel was inferred.` }
          : { status: 'known', value: { distanceMetres, durationSeconds } },
      });
    });
  });
  return {
    id, directed: true,
    provenance: {
      source, method: 'osrm-table', recordedAt: { status: 'known', value: timestamp },
      description: `Frozen OSRM routing-model snapshot; recorded-road does not guarantee actual travel time. ${note}`,
    },
    legs,
  };
}
