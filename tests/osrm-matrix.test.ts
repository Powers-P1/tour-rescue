import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { DirectedRoadLeg, RoadMatrix } from '../src/core/domain.ts';
import { parseOsrmMatrix } from '../src/core/parse-osrm-matrix.ts';
import { ScenarioInputError } from '../src/core/time.ts';

interface OsrmFixture {
  schemaVersion: number;
  id: string;
  dataKind: string;
  metadata: {
    source: string;
    retrieved_at: string;
    note: string;
    directional: boolean;
    units: { durations: string; distances: string };
  };
  cityIds: string[];
  durations: (number | null)[][];
  distances: (number | null)[][];
}

const fixtureUrl = new URL('../fixtures/osrm_matrix_de.json', import.meta.url);
const fixture = (): OsrmFixture => JSON.parse(readFileSync(fixtureUrl, 'utf8')) as OsrmFixture;

function leg(matrix: RoadMatrix, fromCityId: string, toCityId: string): DirectedRoadLeg {
  const result = matrix.legs.find(row => row.fromCityId === fromCityId && row.toCityId === toCityId);
  assert.ok(result);
  return result;
}

test('frozen Germany OSRM table preserves all 24 x 24 directed integer observations', () => {
  const input = fixture();
  const matrix = parseOsrmMatrix(input);
  assert.equal(matrix.id, 'osrm-matrix-de-v1');
  assert.equal(matrix.directed, true);
  assert.equal(matrix.legs.length, 24 * 24);
  assert.equal(matrix.provenance.method, 'osrm-table');
  assert.equal(matrix.provenance.source, input.metadata.source);
  assert.deepEqual(matrix.provenance.recordedAt, {
    status: 'known', value: { iso: '2026-10-21T09:14:14+00:00', timeZone: 'Etc/UTC' },
  });
  assert.match(matrix.provenance.description, /routing-model snapshot/);
  assert.ok(matrix.provenance.description.includes(input.metadata.note));
  assert.ok(matrix.legs.every(row => row.quality === 'recorded-road'));
  assert.deepEqual(leg(matrix, 'de-hamburg', 'de-berlin').travel, {
    status: 'known', value: { durationSeconds: 10538, distanceMetres: 288040 },
  });
  assert.deepEqual(leg(matrix, 'de-berlin', 'de-hamburg').travel, {
    status: 'known', value: { durationSeconds: 10602, distanceMetres: 288758 },
  });
  assert.deepEqual(leg(matrix, 'de-hamburg', 'de-hamburg').travel, {
    status: 'known', value: { durationSeconds: 0, distanceMetres: 0 },
  });
});

test('paired null cells are explicit UNKNOWN without reverse-leg or geometric imputation', () => {
  const input = fixture();
  input.durations[0]![1] = null;
  input.distances[0]![1] = null;
  const matrix = parseOsrmMatrix(input);
  const missing = leg(matrix, 'de-hamburg', 'de-berlin').travel;
  assert.equal(missing.status, 'unknown');
  if (missing.status === 'unknown') assert.match(missing.reason, /de-hamburg -> de-berlin.*no travel was inferred/);
  assert.equal(leg(matrix, 'de-berlin', 'de-hamburg').travel.status, 'known');
  assert.equal(matrix.legs.length, 24 * 24);
});

test('partially available cells are rejected rather than silently completing a road observation', () => {
  for (const field of ['durations', 'distances'] as const) {
    const input = fixture();
    input[field][0]![1] = null;
    assert.throws(() => parseOsrmMatrix(input), /both be available or both be null/);
  }
});

test('negative, fractional, unsafe, non-finite and coerced cells are invalid in either matrix', () => {
  for (const field of ['durations', 'distances'] as const) {
    for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '0', undefined, {}]) {
      const input = fixture();
      Object.assign(input[field][0]!, { 1: invalid });
      assert.throws(() => parseOsrmMatrix(input), /non-negative safe integer or null/);
    }
  }
});

test('matrix dimensions must exactly match the frozen city list, including dense rows', () => {
  const changes: ((input: OsrmFixture) => void)[] = [
    input => { input.durations.pop(); },
    input => { input.distances.push([...input.distances[0]!]); },
    input => { input.durations[0]!.pop(); },
    input => { input.distances[0]!.push(0); },
    input => { delete input.durations[0]; },
    input => { delete input.distances[0]![1]; },
  ];
  for (const change of changes) {
    const input = fixture();
    change(input);
    assert.throws(() => parseOsrmMatrix(input), ScenarioInputError);
  }
});

test('city identifiers must be non-empty, unique and consistent with matrix size', () => {
  for (const change of ['duplicate', 'blank', 'removed', 'empty', 'hole'] as const) {
    const input = fixture();
    if (change === 'duplicate') input.cityIds[1] = input.cityIds[0]!;
    if (change === 'blank') input.cityIds[1] = ' ';
    if (change === 'removed') input.cityIds.pop();
    if (change === 'empty') input.cityIds = [];
    if (change === 'hole') delete input.cityIds[1];
    assert.throws(() => parseOsrmMatrix(input), ScenarioInputError, change);
  }
});

test('schema, routing provenance, units and directional evidence are mandatory', () => {
  const changes: ((input: OsrmFixture) => void)[] = [
    input => { input.schemaVersion = 2; },
    input => { input.dataKind = 'synthetic'; },
    input => { input.id = ''; },
    input => { input.metadata.directional = false; },
    input => { input.metadata.units.durations = 'minutes'; },
    input => { input.metadata.units.distances = 'kilometres'; },
    input => { input.metadata.source = ''; },
    input => { input.metadata.note = ''; },
    input => { Reflect.deleteProperty(input.metadata, 'retrieved_at'); },
  ];
  for (const change of changes) {
    const input = fixture();
    change(input);
    assert.throws(() => parseOsrmMatrix(input), ScenarioInputError);
  }
});

test('retrieval instants normalize Z and numeric offsets to explicit UTC', () => {
  for (const retrievedAt of ['2026-10-21T09:14:14Z', '2026-10-21T11:14:14+02:00', '2026-10-21T04:14:14-05:00']) {
    const input = fixture();
    input.metadata.retrieved_at = retrievedAt;
    assert.deepEqual(parseOsrmMatrix(input).provenance.recordedAt, {
      status: 'known', value: { iso: '2026-10-21T09:14:14+00:00', timeZone: 'Etc/UTC' },
    });
  }
});

test('retrieval timestamps reject missing offsets, rollover dates and invalid offsets', () => {
  for (const retrievedAt of ['', 'not-a-date', '2026-10-21T09:14:14', '2026-02-30T09:14:14Z',
    '2026-10-21T24:14:14Z', '2026-10-21T09:14:14+24:00', '2026-10-21T09:14:14+00:60']) {
    const input = fixture();
    input.metadata.retrieved_at = retrievedAt;
    assert.throws(() => parseOsrmMatrix(input), ScenarioInputError);
  }
});

test('parsing is repeatable and leaves the frozen input unchanged', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = parseOsrmMatrix(input);
  assert.deepEqual(parseOsrmMatrix(input), result);
  assert.deepEqual(input, before);
});
