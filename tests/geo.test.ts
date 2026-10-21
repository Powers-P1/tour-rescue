import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aggregateCellsByCity, cellToCity, loadCityCells } from '../src/qloo/geo.ts';
import type { CityCellsFixture } from '../src/qloo/geo.ts';

const synthetic: CityCellsFixture = {
  metadata: { precision: 5 },
  cities: [
    { cityId: 'a', name: 'A', cells: ['u33d1', 'u33d2'] },
    { cityId: 'b', name: 'B', cells: ['u33e1'] },
    { cityId: 'c', name: 'C', cells: [] },
  ],
  index: { u33d1: 'a', u33d2: 'a', u33e1: 'b' },
};
const cells = loadCityCells(synthetic);

test('exact cell maps to its city', () => {
  assert.equal(cellToCity(cells, 'u33d1'), 'a');
  assert.equal(cellToCity(cells, 'U33E1'), 'b');
});

test('longer geohash falls back to the containing precision-5 cell', () => {
  assert.equal(cellToCity(cells, 'u33d2xyz'), 'a');
});

test('shorter prefix resolves only when unambiguous', () => {
  assert.equal(cellToCity(cells, 'u33d'), 'a');
  assert.equal(cellToCity(cells, 'u33'), null);
  assert.equal(cellToCity(cells, 'u34'), null);
});

test('unknown or invalid cells return null', () => {
  assert.equal(cellToCity(cells, 'zzzzz'), null);
  assert.equal(cellToCity(cells, ''), null);
  assert.equal(cellToCity(cells, 'u33a!'), null);
});

test('aggregation gives sum, mean and count per city', () => {
  const r = aggregateCellsByCity(cells, [
    { geohash: 'u33d1', affinity: 0.2, popularity: 0.5 },
    { geohash: 'u33d2', affinity: 0.6, popularity: 0.1 },
    { geohash: 'u33e1', affinity: 1, popularity: 1 },
  ]);
  const a = r.cities.find(c => c.cityId === 'a');
  assert.ok(a && a.status === 'known');
  assert.equal(a.count, 2);
  assert.ok(Math.abs(a.affinity.sum - 0.8) < 1e-12);
  assert.ok(Math.abs(a.affinity.mean - 0.4) < 1e-12);
  assert.ok(Math.abs(a.popularity.mean - 0.3) < 1e-12);
  assert.equal(r.unmapped, 0);
});

test('city without cells and city without entries are unknown, not zero', () => {
  const r = aggregateCellsByCity(cells, [{ geohash: 'u33d1', affinity: 0.5, popularity: 0.5 }]);
  const b = r.cities.find(c => c.cityId === 'b');
  const c = r.cities.find(x => x.cityId === 'c');
  assert.equal(b?.status, 'unknown');
  assert.equal(c?.status, 'unknown');
  assert.match(c?.status === 'unknown' ? c.reason : '', /no cells/);
  assert.match(b?.status === 'unknown' ? b.reason : '', /no entries/);
});

test('unmapped entries are counted, not assigned', () => {
  const r = aggregateCellsByCity(cells, [
    { geohash: 'zzzzz', affinity: 1, popularity: 1 },
    { geohash: 'u33d1', affinity: 1, popularity: 1 },
  ]);
  assert.equal(r.unmapped, 1);
});

test('non-finite values and corrupt fixtures are rejected', () => {
  assert.throws(() => aggregateCellsByCity(cells, [{ geohash: 'u33d1', affinity: NaN, popularity: 0 }]), RangeError);
  assert.throws(() => loadCityCells({ ...synthetic, index: { u33d1: 'nope' } }), RangeError);
  assert.throws(() => loadCityCells({ ...synthetic, index: { u33: 'a' } }), RangeError);
});

test('committed fixture loads and maps every city centre cell to its own city', () => {
  const fx = JSON.parse(readFileSync(new URL('../fixtures/geo/city_cells_de.json', import.meta.url), 'utf8')) as CityCellsFixture & { metadata: { source: string } };
  const real = loadCityCells(fx);
  assert.equal(real.cityIds.length, 24);
  assert.equal(real.citiesWithoutCells.size, 0);
  assert.match(fx.metadata.source, /no Qloo data/);
  assert.equal(cellToCity(real, 'u33dc'), 'de-berlin'); // Berlin centre area
  assert.equal(cellToCity(real, 'u33dcxx'), 'de-berlin');
});
