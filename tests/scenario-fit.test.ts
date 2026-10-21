import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { computeFitIndex } from '../src/core/fit-index.ts';
import type { FitInput, FitReport } from '../src/core/fit-types.ts';
import { FitInputError, parseFitInput } from '../src/core/parse-fit-input.ts';
import { computeScenarioFitIndex, parseScenarioFitInput, parseSyntheticHeatmapFitInput } from '../src/core/scenario-fit.ts';

type Mutable<T> = { -readonly [P in keyof T]: Mutable<T[P]> };
const inputUrl = new URL('../fixtures/synthetic/fit__complete__three-cities.json', import.meta.url);
const input = (): Mutable<FitInput> => JSON.parse(readFileSync(inputUrl, 'utf8')) as Mutable<FitInput>;

interface SyntheticHeatmapFixture {
  schemaVersion: number;
  id: string;
  dataKind: string;
  metadata: { synthetic: boolean; no_raw_api_data: boolean; candidateSetId: string };
  queries: {
    queryId: string;
    role: string;
    synthetic: boolean;
    entityRef?: unknown;
    heatmap: {
      cityId: string;
      location?: unknown;
      query: { affinity: unknown; affinity_rank?: unknown; popularity?: unknown };
    }[];
  }[];
}

const heatmapUrl = new URL('../fixtures/qloo/heatmap_de_synthetic.json', import.meta.url);
const heatmap = (): SyntheticHeatmapFixture => JSON.parse(readFileSync(heatmapUrl, 'utf8')) as SyntheticHeatmapFixture;

function scores(report: FitReport): Record<string, number> {
  return Object.fromEntries(report.cities.map(city => {
    if (city.value.status !== 'known') assert.fail(city.value.reason);
    return [city.cityId, city.value.value];
  }));
}

test('scenario policy accepts target 0.5 and an equal division of the other 0.5', () => {
  const parsed = parseScenarioFitInput(input());
  assert.deepEqual(parsed.profiles.map(profile => profile.weight), [0.5, 0.25, 0.25]);
  assert.deepEqual(scores(computeScenarioFitIndex(parsed)), { 'city-a': 25, 'city-b': 62.5, 'city-c': 62.5 });
});

test('scenario policy rejects a different target split even when total weight equals one', () => {
  const data = input();
  data.profiles[0]!.weight = 0.6;
  data.profiles[1]!.weight = 0.2;
  data.profiles[2]!.weight = 0.2;
  assert.throws(() => parseScenarioFitInput(data), /target weight must be 0.5/);
  assert.throws(() => computeScenarioFitIndex(data), /target weight must be 0.5/);
});

test('scenario comparisons must have equal weights, not just sum to 0.5', () => {
  const data = input();
  data.profiles[1]!.weight = 0.2;
  data.profiles[2]!.weight = 0.3;
  assert.throws(() => parseScenarioFitInput(data), /comparison weights must each be 0.5 \/ 2/);
});

test('a target-only scenario has weight one and a single comparison has weight 0.5', () => {
  const targetOnly = input();
  targetOnly.profiles = targetOnly.profiles.slice(0, 1);
  targetOnly.profiles[0]!.weight = 1;
  assert.equal(parseScenarioFitInput(targetOnly).profiles[0]?.weight, 1);
  assert.deepEqual(scores(computeScenarioFitIndex(targetOnly)), { 'city-a': 0, 'city-b': 50, 'city-c': 100 });
  targetOnly.profiles[0]!.weight = 0.5;
  assert.throws(() => parseScenarioFitInput(targetOnly), /weights must sum to 1/);
  const oneComparison = input();
  oneComparison.profiles = oneComparison.profiles.slice(0, 2);
  oneComparison.profiles[1]!.weight = 0.5;
  assert.deepEqual(parseScenarioFitInput(oneComparison).profiles.map(profile => profile.weight), [0.5, 0.5]);
});

test('generic parsing and computation continue to accept arbitrary normalized model weights', () => {
  const data = input();
  data.profiles[0]!.weight = 0.7;
  data.profiles[1]!.weight = 0.2;
  data.profiles[2]!.weight = 0.1;
  const parsed = parseFitInput(data);
  assert.deepEqual(parsed.profiles.map(profile => profile.weight), [0.7, 0.2, 0.1]);
  assert.deepEqual(scores(computeFitIndex(parsed)), { 'city-a': 20, 'city-b': 55, 'city-c': 75 });
  assert.throws(() => parseScenarioFitInput(data), FitInputError);
});

test('scenario policy tolerates only differences within 1e-12', () => {
  const near = input();
  near.profiles[0]!.weight += 5e-13;
  near.profiles[1]!.weight -= 5e-13;
  assert.doesNotThrow(() => parseScenarioFitInput(near));
  const outside = input();
  outside.profiles[0]!.weight += 2e-12;
  outside.profiles[1]!.weight -= 2e-12;
  assert.throws(() => parseScenarioFitInput(outside), /target weight/);
});

test('maintained Germany synthetic heatmap gives 24 frozen cities, three profiles and expected independent ranks', () => {
  const data = heatmap();
  const parsed = parseSyntheticHeatmapFitInput(data);
  assert.equal(parsed.candidateSet.id, 'cities-de-v1');
  assert.equal(parsed.candidateSet.cityIds.length, 24);
  assert.equal(parsed.profiles.length, 3);
  assert.deepEqual(parsed.profiles.map(profile => [profile.role, profile.weight]), [
    ['target', 0.5], ['comparison', 0.25], ['comparison', 0.25],
  ]);
  for (const [i, profile] of parsed.profiles.entries()) {
    assert.equal(profile.artistId, data.queries[i]!.queryId);
    assert.equal(profile.observations.length, 24);
    assert.deepEqual(profile.provenance, {
      kind: 'synthetic',
      reference: `fixtures/qloo/heatmap_de_synthetic.json:heatmap-de-synthetic-v1/${profile.queryId}`,
    });
  }
  const report = computeScenarioFitIndex(parsed);
  assert.equal(report.warnings.length, 0);
  const result = scores(report);
  // Zero-based ranks: Hamburg 23/19/6, Berlin 22/22/0, Cologne 18/21/21.
  assert.ok(Math.abs(result['de-hamburg']! - 77.17391304347827) < 1e-10);
  assert.ok(Math.abs(result['de-berlin']! - 71.73913043478261) < 1e-10);
  assert.ok(Math.abs(result['de-cologne']! - 84.78260869565217) < 1e-10);
  // Munich ties Bonn in the target profile (rank 5.5); Augsburg affinity zero is known.
  assert.ok(Math.abs(result['de-munich']! - 41.30434782608695) < 1e-10);
  assert.ok(Math.abs(result['de-augsburg']! - 8.695652173913043) < 1e-10);
  assert.deepEqual(parsed.profiles[0]!.observations.find(row => row.cityId === 'de-augsburg')?.affinity, {
    status: 'known', value: 0,
  });
});

test('synthetic privacy flags are mandatory at envelope and individual-query levels', () => {
  const changes: ((data: SyntheticHeatmapFixture) => void)[] = [
    data => { data.dataKind = 'recording-reference'; },
    data => { data.metadata.synthetic = false; },
    data => { data.metadata.no_raw_api_data = false; },
    data => { Reflect.deleteProperty(data.metadata, 'synthetic'); },
    data => { Reflect.deleteProperty(data.metadata, 'no_raw_api_data'); },
    data => { data.queries[1]!.synthetic = false; },
    data => { Reflect.deleteProperty(data.queries[1]!, 'synthetic'); },
  ];
  for (const change of changes) {
    const data = heatmap();
    change(data);
    assert.throws(() => parseSyntheticHeatmapFitInput(data), FitInputError);
  }
});

test('the synthetic adapter ignores affinity_rank, popularity, locations and placeholder entity references', () => {
  const data = heatmap();
  for (const query of data.queries) {
    delete query.entityRef;
    for (const row of query.heatmap) {
      delete row.location;
      delete row.query.affinity_rank;
      row.query.popularity = 'deliberately unusable as affinity';
    }
  }
  assert.deepEqual(parseSyntheticHeatmapFitInput(data), parseSyntheticHeatmapFitInput(heatmap()));
});

test('explicit synthetic UNKNOWN survives normalization and blocks incomplete aggregate ranks', () => {
  const data = heatmap();
  data.queries[1]!.heatmap[0]!.query.affinity = { status: 'unknown', reason: 'Intentionally absent synthetic evidence' };
  const parsed = parseSyntheticHeatmapFitInput(data);
  assert.deepEqual(parsed.profiles[1]!.observations[0]!.affinity, {
    status: 'unknown', reason: 'Intentionally absent synthetic evidence',
  });
  const report = computeScenarioFitIndex(parsed);
  assert.ok(report.cities.every(row => row.value.status === 'unknown'));
  assert.ok(report.warnings.some(row => row.code === 'INCOMPLETE_PROFILE'));
  assert.equal(parsed.profiles[1]!.weight, 0.25);
});

test('missing or invalid synthetic affinities do not fall back to rank or popularity', () => {
  for (const invalid of [undefined, null, '0.4', NaN, Infinity, {}, { status: 'unknown', reason: '' }]) {
    const data = heatmap();
    data.queries[0]!.heatmap[0]!.query.affinity = invalid;
    assert.throws(() => parseSyntheticHeatmapFitInput(data), FitInputError);
  }
});

test('every query must contain exactly the same frozen set of unique annotated city IDs', () => {
  const changes: ((data: SyntheticHeatmapFixture) => void)[] = [
    data => { data.queries[1]!.heatmap.pop(); },
    data => { data.queries[0]!.heatmap.pop(); },
    data => { data.queries[1]!.heatmap[0]!.cityId = 'unknown-city'; },
    data => { data.queries[1]!.heatmap[0]!.cityId = data.queries[1]!.heatmap[1]!.cityId; },
    data => { data.queries[0]!.heatmap[0]!.cityId = data.queries[0]!.heatmap[1]!.cityId; },
    data => { Reflect.deleteProperty(data.queries[1]!.heatmap[0]!, 'cityId'); },
    data => { delete data.queries[1]!.heatmap[0]; },
  ];
  for (const change of changes) {
    const data = heatmap();
    change(data);
    assert.throws(() => parseSyntheticHeatmapFitInput(data), FitInputError);
  }
});

test('synthetic schema, identity and one-main policy reject ambiguous fixture envelopes', () => {
  const changes: ((data: SyntheticHeatmapFixture) => void)[] = [
    data => { data.schemaVersion = 2; },
    data => { data.id = ''; },
    data => { data.metadata.candidateSetId = ''; },
    data => { data.queries = []; },
    data => { data.queries[0]!.role = 'comparison'; },
    data => { data.queries[1]!.role = 'main'; },
    data => { data.queries[1]!.role = 'target'; },
    data => { data.queries[1]!.queryId = data.queries[0]!.queryId; },
  ];
  for (const change of changes) {
    const data = heatmap();
    change(data);
    assert.throws(() => parseSyntheticHeatmapFitInput(data), FitInputError);
  }
});

test('query and row ordering do not alter the Germany report or mutate the fixture', () => {
  const data = heatmap();
  const before = structuredClone(data);
  const expected = computeScenarioFitIndex(parseSyntheticHeatmapFitInput(data));
  assert.deepEqual(data, before);
  data.queries.reverse();
  for (const query of data.queries) query.heatmap.reverse();
  assert.deepEqual(computeScenarioFitIndex(parseSyntheticHeatmapFitInput(data)), expected);
});
