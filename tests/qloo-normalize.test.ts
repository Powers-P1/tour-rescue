import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { computeFitIndex } from '../src/core/fit-index.ts';
import { parseFitInput } from '../src/core/parse-fit-input.ts';
import type { NormalizationContext } from '../src/qloo/contracts.ts';
import { loadCityCells } from '../src/qloo/geo.ts';
import { normalizeHeatmapCells, parseArtistSearchResponse, parseHeatmapResponse, QlooContractError } from '../src/qloo/normalize.ts';
import { fixture, freezeDeep } from './helpers/scenarios.ts';

function examples() {
  return fixture('qloo/contract_examples_synthetic.json') as { heatmap: {
    success: boolean; results: { heatmap: { location: { geohash: string }; query: Record<string, unknown> }[] }; warnings: string[];
  }; search: { success: boolean; results: Record<string, unknown>[] } };
}
const mapping = loadCityCells({ metadata: { precision: 5 }, cities: [
  { cityId: 'city-a', name: 'A', cells: ['u1x0e', 'u1x0s'] }, { cityId: 'city-b', name: 'B', cells: ['u33dc'] },
], index: { u1x0e: 'city-a', u1x0s: 'city-a', u33dc: 'city-b' } });
const context: NormalizationContext = { candidateSet: { id: 'two-cities', cityIds: ['city-a', 'city-b'] },
  queryId: 'synthetic-query', artistId: 'synthetic-artist', role: 'target', weight: 1,
  provenance: { kind: 'synthetic', reference: 'hand-written contract fixture' } };

test('verified heatmap envelope projects only geohash/affinity/popularity; zero is a valid score', () => {
  const body = examples().heatmap;
  body.results.heatmap[0]!.query.affinity = 0;
  freezeDeep(body);
  const parsed = parseHeatmapResponse(body);
  assert.deepEqual(parsed.value[0], { geohash: 'u1x0e', affinity: 0, popularity: 0.9 });
  assert.equal(parsed.upstreamWarningCount, 1);
  assert.throws(() => parseHeatmapResponse({ heatmap: body.results.heatmap }), QlooContractError);
  assert.throws(() => parseHeatmapResponse({ success: true, results: body.results.heatmap }), QlooContractError);
  assert.throws(() => parseHeatmapResponse({ ...body, success: false }), QlooContractError);
});

test('malformed, duplicated, mixed-resolution and oversized cell sets fail without rank fallback', () => {
  for (const affinity of [undefined, '0.2', -0.1, 1.1, NaN, Infinity]) {
    const body = examples().heatmap;
    body.results.heatmap[0]!.query.affinity = affinity;
    assert.throws(() => parseHeatmapResponse(body), QlooContractError);
  }
  for (const geohash of ['u33dc', 'u1x0e1', 'XXXXX', '']) {
    const body = examples().heatmap;
    body.results.heatmap[0]!.location.geohash = geohash;
    assert.throws(() => parseHeatmapResponse(body), QlooContractError);
  }
  assert.throws(() => parseHeatmapResponse(examples().heatmap, 2), QlooContractError);
});

test('city mean avoids area/count/popularity bonuses and the existing core computes percentiles', () => {
  const parsed = parseHeatmapResponse(examples().heatmap);
  const result = normalizeHeatmapCells(parsed.value, context, mapping);
  assert.deepEqual(result.profile.observations, [
    { cityId: 'city-a', affinity: { status: 'known', value: 0.5 } },
    { cityId: 'city-b', affinity: { status: 'known', value: 0.9 } },
  ]);
  const report = computeFitIndex(parseFitInput({ schemaVersion: 'tour-rescue.fit-input.v1',
    candidateSet: context.candidateSet, profiles: [result.profile] }));
  assert.deepEqual(report.cities.map(city => city.value), [{ status: 'known', value: 0 }, { status: 'known', value: 100 }]);
});

test('unmapped cells stay unassigned and absent frozen-city evidence makes the aggregate UNKNOWN', () => {
  const cells = [{ geohash: 'u1x0e', affinity: 0.3, popularity: 1 }, { geohash: 'zzzzz', affinity: 1, popularity: 1 }];
  const result = normalizeHeatmapCells(cells, context, mapping);
  assert.equal(result.profile.observations[1]!.affinity.status, 'unknown');
  assert.deepEqual(result.warnings.map(w => w.code), ['UNMAPPED_HEATMAP_CELLS', 'MISSING_CITY_AFFINITY']);
  const report = computeFitIndex(parseFitInput({ schemaVersion: 'tour-rescue.fit-input.v1',
    candidateSet: context.candidateSet, profiles: [result.profile] }));
  assert.ok(report.cities.every(city => city.value.status === 'unknown'));
});

test('documented longer geohashes use the existing mapping and empty heatmaps preserve the universe', () => {
  const long = normalizeHeatmapCells([{ geohash: 'u1x0e1', affinity: 0.5, popularity: 0.2 },
    { geohash: 'u33dc1', affinity: 0.6, popularity: 0.1 }], context, mapping);
  assert.ok(long.profile.observations.every(row => row.affinity.status === 'known'));
  const empty = normalizeHeatmapCells(parseHeatmapResponse({ success: true, results: { heatmap: [] } }).value, context, mapping);
  assert.equal(empty.profile.observations.length, 2);
  assert.ok(empty.profile.observations.every(row => row.affinity.status === 'unknown'));
});

test('search uses the official direct results array and exports only verified artist identities', () => {
  const body = examples().search;
  assert.deepEqual(parseArtistSearchResponse(body).value, [{ id: '11111111-1111-4111-8111-111111111111', name: 'The Fictional Tides' }]);
  assert.throws(() => parseArtistSearchResponse({ results: { entities: body.results } }), QlooContractError);
  for (const changes of [{ entity_id: 'artist-name' }, { types: ['urn:entity:movie'] }, { name: '' }, { name: 'bad\nlabel' }]) {
    assert.throws(() => parseArtistSearchResponse({ results: [{ ...body.results[0], ...changes }] }), QlooContractError);
  }
  assert.throws(() => parseArtistSearchResponse({ results: [...body.results, ...body.results] }), QlooContractError);
  assert.throws(() => parseArtistSearchResponse({ success: 'true', results: body.results }), QlooContractError);
});
