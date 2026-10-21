import assert from 'node:assert/strict';
import test from 'node:test';
import { computeFitIndex } from '../src/core/fit-index.ts';
import { buildLeaveOneArtistOutInputs, computeLeaveOneArtistOutFits } from '../src/core/fit-sensitivity.ts';
import type { FitInput, FitReport } from '../src/core/fit-types.ts';
import { FitInputError, parseFitInput } from '../src/core/parse-fit-input.ts';
import { parseScenarioFitInput, parseSyntheticHeatmapFitInput } from '../src/core/scenario-fit.ts';
import { fixture, freezeDeep } from './helpers/scenarios.ts';
import type { Mutable } from './helpers/scenarios.ts';

const input = (): Mutable<FitInput> =>
  parseFitInput(fixture('synthetic/fit__complete__three-cities.json')) as Mutable<FitInput>;

function scores(report: FitReport): Record<string, number> {
  return Object.fromEntries(report.cities.map(city => {
    if (city.value.status !== 'known') assert.fail(city.value.reason);
    return [city.cityId, city.value.value];
  }));
}

test('each comparison omission records proportional survivor weights instead of resetting 50/50', () => {
  const data = input();
  const runs = buildLeaveOneArtistOutInputs(data);
  assert.equal(runs.length, 2);
  const target = data.profiles.find(profile => profile.role === 'target')!;
  for (const run of runs) {
    assert.equal(run.removed.weight, 0.25);
    assert.notEqual(run.removed.artistId, target.artistId);
    assert.equal(run.input.profiles.length, 2);
    const retainedTarget = run.input.profiles.find(profile => profile.role === 'target')!;
    const comparison = run.input.profiles.find(profile => profile.role === 'comparison')!;
    assert.equal(retainedTarget.weight, 2 / 3);
    assert.equal(comparison.weight, 1 / 3);
    assert.deepEqual(run.retainedWeights.find(row => row.artistId === target.artistId), {
      artistId: target.artistId, queryId: target.queryId, before: 0.5, after: 2 / 3,
    });
    assert.doesNotThrow(() => parseFitInput(run.input));
    assert.throws(() => parseScenarioFitInput(run.input), /scenario.*weight/);
  }
});

test('one comparison produces a target-only run with weight one', () => {
  const data = input();
  data.profiles = data.profiles.slice(0, 2);
  data.profiles[1]!.weight = 0.5;
  const runs = buildLeaveOneArtistOutInputs(data);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.input.profiles.length, 1);
  assert.equal(runs[0]?.input.profiles[0]?.role, 'target');
  assert.equal(runs[0]?.input.profiles[0]?.weight, 1);
  const report = computeLeaveOneArtistOutFits(data);
  assert.deepEqual(scores(report.runs[0]!.fitReport), { 'city-a': 0, 'city-b': 50, 'city-c': 100 });
});

test('target-only input reports not-applicable rather than invented stability or target removal', () => {
  const data = input();
  data.profiles = [{ ...data.profiles[0]!, weight: 1 }];
  assert.deepEqual(buildLeaveOneArtistOutInputs(data), []);
  const report = computeLeaveOneArtistOutFits(data);
  assert.equal(report.status, 'not-applicable');
  assert.equal(report.scope, 'comparison-artists-only');
  assert.equal(report.normalization, 'proportional-survivor-weights-v1');
  assert.deepEqual(report.runs, []);
  assert.match(report.reason, /target artist is never omitted/);
  assert.deepEqual(report.baseline, computeFitIndex(data));
});

test('every retained profile keeps all cities, observations, roles and provenance', () => {
  const data = input();
  data.profiles[0]!.provenance = {
    kind: 'recording-reference', reference: 'private-evidence-contract-example',
    evidenceId: 'synthetic-reference-only', recordedAt: '2026-10-21T09:00:00+00:00',
    normalizationVersion: 'test-only-v1',
  };
  for (const run of buildLeaveOneArtistOutInputs(data)) {
    assert.equal(run.input.candidateSet.id, data.candidateSet.id);
    assert.deepEqual([...run.input.candidateSet.cityIds].sort(), [...data.candidateSet.cityIds].sort());
    for (const profile of run.input.profiles) {
      const original = data.profiles.find(item => item.artistId === profile.artistId)!;
      assert.equal(profile.queryId, original.queryId);
      assert.equal(profile.role, original.role);
      assert.equal(profile.candidateSetId, original.candidateSetId);
      assert.deepEqual(profile.provenance, original.provenance);
      assert.deepEqual(profile.observations,
        [...original.observations].sort((a, b) => a.cityId < b.cityId ? -1 : a.cityId > b.cityId ? 1 : 0));
    }
  }
});

test('an explicit unknown remains unless its whole comparison profile is deliberately omitted', () => {
  const data = input();
  const incomplete = data.profiles[1]!;
  incomplete.observations[0]!.affinity = { status: 'unknown', reason: 'No comparable city evidence.' };
  const report = computeLeaveOneArtistOutFits(data);
  assert.equal(report.status, 'complete');
  assert.ok(report.baseline.cities.every(city => city.value.status === 'unknown'));
  const removedIncomplete = report.runs.find(run => run.removed.artistId === incomplete.artistId)!;
  const retainedIncomplete = report.runs.find(run => run.removed.artistId !== incomplete.artistId)!;
  assert.ok(removedIncomplete.fitReport.cities.every(city => city.value.status === 'known'));
  assert.ok(retainedIncomplete.fitReport.cities.every(city => city.value.status === 'unknown'));
  const retainedRun = buildLeaveOneArtistOutInputs(data)
    .find(run => run.removed.artistId !== incomplete.artistId)!;
  assert.deepEqual(retainedRun.input.profiles.find(profile => profile.artistId === incomplete.artistId)
    ?.observations.find(row => row.cityId === incomplete.observations[0]!.cityId)?.affinity,
  { status: 'unknown', reason: 'No comparable city evidence.' });
  assert.equal(retainedRun.input.candidateSet.cityIds.length, 3);
});

test('unknown target evidence cannot be repaired by removing a comparison', () => {
  const data = input();
  data.profiles[0]!.observations[0]!.affinity = { status: 'unknown', reason: 'Target evidence missing.' };
  const report = computeLeaveOneArtistOutFits(data);
  assert.ok(report.runs.every(run => run.fitReport.cities.every(city => city.value.status === 'unknown')));
  assert.ok(report.runs.every(run => run.fitReport.profiles.some(profile => profile.role === 'target')));
});

test('generic nondefault weights are retained proportionally and subtraction cancellation is avoided', () => {
  const data = input();
  [0.7, 0.2, 0.1].forEach((weight, index) => { data.profiles[index]!.weight = weight; });
  const removed = data.profiles[1]!;
  const run = buildLeaveOneArtistOutInputs(data).find(item => item.removed.artistId === removed.artistId)!;
  assert.ok(Math.abs(run.input.profiles.find(profile => profile.role === 'target')!.weight - 0.875) < 1e-15);
  assert.ok(Math.abs(run.input.profiles.find(profile => profile.role === 'comparison')!.weight - 0.125) < 1e-15);

  const nearOne = input();
  nearOne.profiles = [
    { ...nearOne.profiles[0]!, weight: 1e-20 },
    { ...nearOne.profiles[1]!, weight: 1 },
  ];
  // Accepted by the existing generic parser's sum tolerance: 1 - removed.weight is 0.
  const tinySurvivor = buildLeaveOneArtistOutInputs(nearOne)[0]!;
  assert.equal(tinySurvivor.input.profiles[0]!.weight, 1);
  assert.doesNotThrow(() => computeFitIndex(tinySurvivor.input));
});

test('maintained Germany fixture keeps 24 cities and yields independently computed omission scores', () => {
  const data = parseSyntheticHeatmapFitInput(fixture('qloo/heatmap_de_synthetic.json'));
  const report = computeLeaveOneArtistOutFits(data);
  assert.equal(report.runs.length, 2);
  assert.equal(report.baseline.candidateSet.cityIds.length, 24);
  assert.equal(scores(report.baseline)['de-frankfurt'], 58.695652173913);
  assert.equal(scores(report.baseline)['de-nuremberg'], 25);
  const values = report.runs.map(run => ({
    frankfurt: scores(run.fitReport)['de-frankfurt'], nuremberg: scores(run.fitReport)['de-nuremberg'],
  }));
  assert.deepEqual(values, [
    { frankfurt: 49.275362318841, nuremberg: 13.04347826087 },
    { frankfurt: 66.666666666667, nuremberg: 28.985507246377 },
  ]);
  for (const run of report.runs) {
    assert.deepEqual(run.fitReport.candidateSet, report.baseline.candidateSet);
    assert.equal(run.fitReport.profiles.length, 2);
    assert.ok(run.fitReport.profiles.every(profile => profile.provenance.kind === 'synthetic'));
  }
});

test('canonical omission order and values ignore input ordering and do not mutate frozen inputs', () => {
  const data = input();
  const before = structuredClone(data);
  freezeDeep(data);
  const expectedInputs = buildLeaveOneArtistOutInputs(data);
  const expectedReport = computeLeaveOneArtistOutFits(data);
  assert.deepEqual(data, before);
  const shuffled = input();
  shuffled.candidateSet.cityIds.reverse();
  shuffled.profiles.reverse();
  shuffled.profiles.forEach(profile => profile.observations.reverse());
  assert.deepEqual(buildLeaveOneArtistOutInputs(shuffled), expectedInputs);
  assert.deepEqual(computeLeaveOneArtistOutFits(shuffled), expectedReport);
  assert.deepEqual(computeLeaveOneArtistOutFits(data), expectedReport);
});

test('invalid baseline contracts fail before any omission can hide the invalid data', () => {
  const data = input();
  data.profiles[1]!.observations.pop();
  assert.throws(() => buildLeaveOneArtistOutInputs(data), FitInputError);
  assert.throws(() => computeLeaveOneArtistOutFits(data), FitInputError);
  const noTarget = input();
  noTarget.profiles[0]!.role = 'comparison';
  assert.throws(() => buildLeaveOneArtistOutInputs(noTarget), /exactly one target/);
});
