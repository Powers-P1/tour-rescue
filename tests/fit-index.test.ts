import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { computeFitIndex, FitInputError, parseFitInput } from '../src/core/index.ts';
import type { FitInput, FitReport } from '../src/core/index.ts';

type Mutable<T> = { -readonly [P in keyof T]: Mutable<T[P]> };
const fixtureUrl = new URL('../fixtures/synthetic/fit__complete__three-cities.json', import.meta.url);
const input = (): Mutable<FitInput> => JSON.parse(readFileSync(fixtureUrl, 'utf8')) as Mutable<FitInput>;

function scores(report: FitReport): Record<string, number> {
  return Object.fromEntries(report.cities.map(city => {
    if (city.value.status !== 'known') assert.fail(city.value.reason);
    return [city.cityId, city.value.value];
  }));
}

function singleProfile(values: readonly number[]): FitInput {
  const base = input();
  const target = base.profiles[0];
  assert.ok(target);
  const cityIds = values.map((_, i) => `city-${i}`);
  return {
    ...base, candidateSet: { ...base.candidateSet, cityIds },
    profiles: [{ ...target, weight: 1, observations: values.map((value, i) => ({
      cityId: cityIds[i]!, affinity: { status: 'known', value },
    })) }],
  };
}

function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
}

test('fixture gives hand-calculated weighted percentiles, not averaged raw affinity', () => {
  const report = computeFitIndex(parseFitInput(input()));
  assert.deepEqual(scores(report), { 'city-a': 25, 'city-b': 62.5, 'city-c': 62.5 });
  assert.equal(report.method, 'weighted-midrank-v1');
  assert.equal(report.warnings.length, 0);
  assert.ok(report.profiles.every(profile => profile.provenance.kind === 'synthetic'));
});

test('independent monotone transformations of query-local scores leave all indices unchanged', () => {
  const original = input();
  const transformed = input();
  transformed.profiles.forEach((profile, i) => {
    for (const row of profile.observations) {
      if (row.affinity.status === 'known') {
        row.affinity.value = i === 0 ? row.affinity.value ** 3 : 7 + (i + 1) * row.affinity.value;
      }
    }
  });
  assert.deepEqual(computeFitIndex(transformed), computeFitIndex(original));
});

test('city, profile and observation order do not change the report', () => {
  const shuffled = input();
  shuffled.candidateSet.cityIds.reverse();
  shuffled.profiles.reverse();
  for (const profile of shuffled.profiles) profile.observations.reverse();
  assert.deepEqual(computeFitIndex(shuffled), computeFitIndex(input()));
});

test('does not mutate frozen inputs and repeats deterministically', () => {
  const data = input();
  const snapshot = structuredClone(data);
  freezeDeep(data);
  const first = computeFitIndex(data);
  assert.deepEqual(first, computeFitIndex(data));
  assert.deepEqual(data, snapshot);
});

test('ties use average rank, including zero-valued affinity at the minimum', () => {
  const values = Object.values(scores(computeFitIndex(singleProfile([0, 0, 2, 5]))));
  const expected = [100 / 6, 100 / 6, 200 / 3, 100];
  values.forEach((value, i) => assert.ok(Math.abs(value - expected[i]!) < 1e-10));
});

test('all ties yield 50 and explicit uninformative profile/aggregate warnings', () => {
  const report = computeFitIndex(singleProfile([7, 7, 7]));
  assert.deepEqual(Object.values(scores(report)), [50, 50, 50]);
  assert.deepEqual(report.profiles[0]?.informative, { status: 'known', value: false });
  assert.deepEqual(report.warnings.map(warning => warning.code), ['FLAT_PROFILE', 'FLAT_AGGREGATE']);
});

test('a flat profile keeps its weight rather than improving the remaining artist fit', () => {
  const data = input();
  data.profiles = data.profiles.slice(0, 2);
  data.profiles[1]!.weight = 0.5;
  data.profiles[1]!.observations.forEach(row => { row.affinity = { status: 'known', value: 7 }; });
  assert.deepEqual(scores(computeFitIndex(data)), { 'city-a': 25, 'city-b': 50, 'city-c': 75 });
});

test('opposite informative profiles can yield a flat aggregate without flat profiles', () => {
  const data = input();
  data.profiles = data.profiles.slice(0, 2);
  data.profiles[1]!.weight = 0.5;
  const report = computeFitIndex(data);
  assert.deepEqual(Object.values(scores(report)), [50, 50, 50]);
  assert.deepEqual(report.warnings.map(warning => warning.code), ['FLAT_AGGREGATE']);
});

test('one unknown city in a comparison makes every aggregate unknown without reweighting', () => {
  const data = input();
  data.profiles[2]!.observations[2]!.affinity = { status: 'unknown', reason: 'No recorded heatmap row' };
  const report = computeFitIndex(data);
  assert.ok(report.cities.every(city => city.value.status === 'unknown'));
  const missing = report.profiles.find(profile => profile.queryId === data.profiles[2]!.queryId);
  assert.ok(missing?.percentiles.every(city => city.value.status === 'unknown'));
  assert.equal(missing?.weight, 0.25);
  assert.equal(report.profiles.find(profile => profile.role === 'target')?.percentiles[0]?.value.status, 'known');
  assert.ok(report.warnings.some(warning => warning.code === 'INCOMPLETE_PROFILE'));
});

test('fractional percentiles do not invent a winning city in a mathematically flat aggregate', () => {
  const base = singleProfile([0, 1, 2, 3]);
  const target = base.profiles[0]!;
  const reverse = singleProfile([3, 2, 1, 0]).profiles[0]!;
  const data: FitInput = { ...base, profiles: [
    { ...target, weight: 0.5 },
    { ...reverse, queryId: 'comp-a-query', artistId: 'comp-a', role: 'comparison', weight: 0.25 },
    { ...reverse, queryId: 'comp-b-query', artistId: 'comp-b', role: 'comparison', weight: 0.25 },
  ] };
  const report = computeFitIndex(data);
  assert.deepEqual(Object.values(scores(report)), [50, 50, 50, 50]);
  assert.deepEqual(report.warnings.map(warning => warning.code), ['FLAT_AGGREGATE']);
});

test('singleton candidate universe remains unknown rather than reporting perfect fit', () => {
  const report = computeFitIndex(singleProfile([99]));
  assert.equal(report.cities[0]?.value.status, 'unknown');
  assert.equal(report.warnings[0]?.code, 'INSUFFICIENT_CANDIDATES');
});

test('two cities may legitimately have fit 0 and 100', () => {
  assert.deepEqual(Object.values(scores(computeFitIndex(singleProfile([0, 1])))), [0, 100]);
});

test('missing/extra/duplicate city rows are contract errors; missing evidence must be explicit', () => {
  for (const change of ['missing', 'extra', 'duplicate', 'candidate-duplicate', 'different-set'] as const) {
    const data = input();
    const profile = data.profiles[0]!;
    if (change === 'missing') profile.observations.pop();
    if (change === 'extra') profile.observations.push({ cityId: 'outside-city', affinity: { status: 'known', value: 1 } });
    if (change === 'duplicate') profile.observations[1]!.cityId = profile.observations[0]!.cityId;
    if (change === 'candidate-duplicate') data.candidateSet.cityIds[1] = data.candidateSet.cityIds[0]!;
    if (change === 'different-set') profile.candidateSetId = 'other-set';
    assert.throws(() => parseFitInput(data), FitInputError, change);
  }
});

test('non-finite and coercible affinity values are rejected, not treated as zero', () => {
  for (const invalid of [NaN, Infinity, -Infinity, null, '0', undefined]) {
    const data = input();
    Object.assign(data.profiles[0]!.observations[0]!, { affinity: { status: 'known', value: invalid } });
    assert.throws(() => parseFitInput(data), /finite number/);
  }
});

test('invalid or unnormalised weights and duplicate artists/queries are rejected', () => {
  for (const weight of [0, -1, NaN, Infinity, 0.6]) {
    const data = input();
    data.profiles[0]!.weight = weight;
    assert.throws(() => computeFitIndex(data), FitInputError);
  }
  const artist = input();
  artist.profiles[1]!.artistId = artist.profiles[0]!.artistId;
  assert.throws(() => parseFitInput(artist), /duplicate identifier/);
  const query = input();
  query.profiles[1]!.queryId = query.profiles[0]!.queryId;
  assert.throws(() => parseFitInput(query), /duplicate identifier/);
});

test('requires one target, non-empty universe, known contract version and explicit unknown reasons', () => {
  const noTarget = input();
  noTarget.profiles[0]!.role = 'comparison';
  assert.throws(() => parseFitInput(noTarget), /exactly one target/);
  const twoTargets = input();
  twoTargets.profiles[1]!.role = 'target';
  assert.throws(() => parseFitInput(twoTargets), /exactly one target/);
  assert.throws(() => parseFitInput({ ...input(), candidateSet: { id: 'empty', cityIds: [] } }), /must not be empty/);
  assert.throws(() => parseFitInput({ ...input(), schemaVersion: 'unrecognised' }), /schemaVersion/);
  const blankReason = input();
  blankReason.profiles[0]!.observations[0]!.affinity = { status: 'unknown', reason: ' ' };
  assert.throws(() => parseFitInput(blankReason), /non-empty string/);
});

test('recording references require evidence identity, acquisition time and normalization version', () => {
  const data = input();
  Object.assign(data.profiles[0]!, { provenance: { kind: 'recording-reference', reference: 'private-probe-reference' } });
  assert.throws(() => parseFitInput(data), /evidenceId/);
  data.profiles[0]!.provenance = {
    kind: 'recording-reference', reference: 'private-probe-reference',
    evidenceId: 'synthetic-test-of-reference-contract', recordedAt: '2026-10-21T10:00:00+00:00',
    normalizationVersion: 'test-contract-v1',
  };
  const parsed = parseFitInput(data);
  assert.deepEqual(parsed.profiles[0]?.provenance, data.profiles[0]!.provenance);
});
