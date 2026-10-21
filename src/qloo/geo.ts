/**
 * Pure geometry-only mapping from geohash cells to scenario cities.
 * Built from fixtures/geo/city_cells_de.json (see scripts/build_city_cells.py).
 * No Qloo data and no I/O here.
 */

export interface CityCellsFixture {
  readonly metadata: { readonly precision: number };
  readonly cities: readonly { readonly cityId: string; readonly name: string; readonly cells: readonly string[] }[];
  /** cell -> cityId, one owner per cell (nearest-centre rule applied by the builder). */
  readonly index: Readonly<Record<string, string>>;
}

export interface CityCells {
  readonly precision: number;
  readonly cityIds: readonly string[];
  /** cityIds that own zero cells in the fixture. */
  readonly citiesWithoutCells: ReadonlySet<string>;
  readonly index: ReadonlyMap<string, string>;
}

export interface CellEntry {
  readonly geohash: string;
  readonly affinity: number;
  readonly popularity: number;
}

export interface Stat {
  readonly sum: number;
  readonly mean: number;
}

export type CityAggregate =
  | { readonly cityId: string; readonly status: 'known'; readonly count: number; readonly affinity: Stat; readonly popularity: Stat }
  | { readonly cityId: string; readonly status: 'unknown'; readonly reason: string };

export interface AggregateResult {
  readonly cities: readonly CityAggregate[];
  /** Entries whose geohash maps to no scenario city (never silently assigned). */
  readonly unmapped: number;
}

const GEOHASH = /^[0-9bcdefghjkmnpqrstuvwxyz]+$/;

export function loadCityCells(fixture: CityCellsFixture): CityCells {
  const precision = fixture.metadata.precision;
  if (!Number.isInteger(precision) || precision < 1) throw new RangeError('fixture precision must be a positive integer');
  const known = new Set(fixture.cities.map(c => c.cityId));
  const index = new Map<string, string>();
  for (const [cell, cityId] of Object.entries(fixture.index)) {
    if (cell.length !== precision || !GEOHASH.test(cell)) throw new RangeError(`bad cell in index: ${cell}`);
    if (!known.has(cityId)) throw new RangeError(`index refers to unknown city: ${cityId}`);
    index.set(cell, cityId);
  }
  const owners = new Set(index.values());
  return {
    precision,
    cityIds: fixture.cities.map(c => c.cityId),
    citiesWithoutCells: new Set(fixture.cities.map(c => c.cityId).filter(id => !owners.has(id))),
    index,
  };
}

/**
 * Longer geohash than the fixture precision: truncated to it (a prefix is the containing cell).
 * Shorter geohash: resolved only if every fixture cell under that prefix belongs to ONE city;
 * a prefix that spans several cities, or none, returns null (no guess).
 * Invalid input returns null.
 */
export function cellToCity(cells: CityCells, geohash: string): string | null {
  const gh = geohash.toLowerCase();
  if (gh.length === 0 || !GEOHASH.test(gh)) return null;
  if (gh.length >= cells.precision) return cells.index.get(gh.slice(0, cells.precision)) ?? null;
  let owner: string | null = null;
  for (const [cell, cityId] of cells.index) {
    if (!cell.startsWith(gh)) continue;
    if (owner === null) owner = cityId;
    else if (owner !== cityId) return null;
  }
  return owner;
}

/** Sum, mean and count per city. A city with no mapped entry is unknown, never zero. */
export function aggregateCellsByCity(cells: CityCells, entries: readonly CellEntry[]): AggregateResult {
  const acc = new Map<string, { n: number; a: number; p: number }>();
  let unmapped = 0;
  for (const e of entries) {
    if (!Number.isFinite(e.affinity) || !Number.isFinite(e.popularity)) throw new RangeError(`non-finite value for ${e.geohash}`);
    const cityId = cellToCity(cells, e.geohash);
    if (cityId === null) {
      unmapped++;
      continue;
    }
    const s = acc.get(cityId) ?? { n: 0, a: 0, p: 0 };
    s.n++;
    s.a += e.affinity;
    s.p += e.popularity;
    acc.set(cityId, s);
  }
  const out: CityAggregate[] = cells.cityIds.map((cityId): CityAggregate => {
    if (cells.citiesWithoutCells.has(cityId)) return { cityId, status: 'unknown', reason: 'city has no cells in the geometry mapping' };
    const s = acc.get(cityId);
    if (!s) return { cityId, status: 'unknown', reason: 'no entries fall in this city\'s cells' };
    return { cityId, status: 'known', count: s.n, affinity: { sum: s.a, mean: s.a / s.n }, popularity: { sum: s.p, mean: s.p / s.n } };
  });
  return { cities: out, unmapped };
}
