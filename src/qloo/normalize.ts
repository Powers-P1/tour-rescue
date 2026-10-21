import type { EvidenceWarning } from '../core/evidence-types.ts';
import type { NormalizationContext, NormalizedHeatmap } from './contracts.ts';
import { aggregateCellsByCity } from './geo.ts';
import type { CellEntry, CityCells } from './geo.ts';

export const NORMALIZATION_VERSION = 'qloo-geohash-city-mean-v1';
export const QLOO_ENTITY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GEOHASH = /^[0-9bcdefghjkmnpqrstuvwxyz]{1,12}$/;

export class QlooContractError extends Error {
  constructor(message = 'Qloo response does not match the verified contract.') {
    super(message);
    this.name = 'QlooContractError';
  }
}

export interface ArtistMatch { readonly id: string; readonly name: string }
export interface ParsedQloo<T> { readonly value: T; readonly upstreamWarningCount: number }

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new QlooContractError();
  return value as Record<string, unknown>;
}

function unit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new QlooContractError();
  return value;
}

function warningCount(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return Array.isArray(value) ? Math.min(value.length, 1000) : 1;
}

/** Documented results.heatmap envelope; unrelated fields never become fallback scores. */
export function parseHeatmapResponse(value: unknown, maximumCells = 5000): ParsedQloo<readonly CellEntry[]> {
  if (!Number.isSafeInteger(maximumCells) || maximumCells < 1 || maximumCells > 5000) throw new QlooContractError();
  const response = record(value);
  if (response.success !== true) throw new QlooContractError();
  const rows = record(response.results).heatmap;
  if (!Array.isArray(rows) || rows.length > maximumCells) throw new QlooContractError();
  const seen = new Set<string>();
  let precision: number | undefined;
  const cells = rows.map((value): CellEntry => {
    const row = record(value);
    const location = record(row.location);
    const query = record(row.query);
    const geohash = location.geohash;
    if (typeof geohash !== 'string' || !GEOHASH.test(geohash) || seen.has(geohash)) throw new QlooContractError();
    // Mixed resolution can overlap cells or weight the same area unequally.
    if (precision !== undefined && precision !== geohash.length) throw new QlooContractError();
    precision = geohash.length;
    seen.add(geohash);
    return { geohash, affinity: unit(query.affinity), popularity: unit(query.popularity) };
  });
  return { value: cells, upstreamWarningCount: warningCount(response.warnings) };
}

/** /search uses a direct results array, as consumed by the official Qloo harness. */
export function parseArtistSearchResponse(value: unknown, maximumResults = 10): ParsedQloo<readonly ArtistMatch[]> {
  if (!Number.isSafeInteger(maximumResults) || maximumResults < 1 || maximumResults > 50) throw new QlooContractError();
  const response = record(value);
  if ((response.success !== undefined && response.success !== true)
      || !Array.isArray(response.results) || response.results.length > maximumResults) {
    throw new QlooContractError();
  }
  const seen = new Set<string>();
  const artists = response.results.map((value): ArtistMatch => {
    const row = record(value);
    const id = row.entity_id;
    const name = row.name;
    const isArtist = row.subtype === 'urn:entity:artist' || row.type === 'urn:entity:artist'
      || (Array.isArray(row.types) && row.types.includes('urn:entity:artist'));
    if (typeof id !== 'string' || !QLOO_ENTITY_ID.test(id) || seen.has(id.toUpperCase()) || !isArtist
        || typeof name !== 'string' || name.trim().length === 0 || name.length > 300 || /[\u0000-\u001f\u007f]/u.test(name)) {
      throw new QlooContractError();
    }
    seen.add(id.toUpperCase());
    return { id: id.toUpperCase(), name: name.trim() };
  });
  return { value: artists, upstreamWarningCount: warningCount(response.warnings) };
}

/**
 * One query -> mapped city means -> the core's within-profile midrank percentiles.
 * No area/count/popularity bonus is included in affinity and absent cities stay UNKNOWN.
 */
export function normalizeHeatmapCells(
  cells: readonly CellEntry[], context: NormalizationContext, mapping: CityCells,
): NormalizedHeatmap {
  const cityIds = context.candidateSet.cityIds;
  if (!context.candidateSet.id || cityIds.length === 0 || new Set(cityIds).size !== cityIds.length
      || cityIds.some(id => !mapping.cityIds.includes(id)) || !context.queryId || !context.artistId
      || !['target', 'comparison'].includes(context.role) || !Number.isFinite(context.weight)
      || context.weight <= 0 || context.weight > 1) throw new QlooContractError('Invalid frozen normalization context.');
  const result = aggregateCellsByCity(mapping, cells);
  const byCity = new Map(result.cities.map(city => [city.cityId, city]));
  const observations = [...cityIds].sort().map(cityId => {
    const city = byCity.get(cityId)!;
    return { cityId, affinity: city.status === 'known'
      ? { status: 'known' as const, value: city.affinity.mean }
      : { status: 'unknown' as const, reason: city.reason } };
  });
  const missing = observations.filter(row => row.affinity.status === 'unknown').length;
  const warnings: EvidenceWarning[] = [];
  if (result.unmapped > 0) warnings.push({ code: 'UNMAPPED_HEATMAP_CELLS', queryId: context.queryId,
    message: `${result.unmapped} heatmap cells map to no scenario city and were not assigned.` });
  if (missing > 0) warnings.push({ code: 'MISSING_CITY_AFFINITY', queryId: context.queryId,
    message: `${missing} frozen candidate cities have no mapped heatmap evidence; their affinity is UNKNOWN.` });
  return { profile: { queryId: context.queryId, candidateSetId: context.candidateSet.id,
    artistId: context.artistId, role: context.role, weight: context.weight,
    provenance: context.provenance, observations }, warnings };
}

export function normalizeHeatmapResponse(value: unknown, context: NormalizationContext, mapping: CityCells): NormalizedHeatmap {
  return normalizeHeatmapCells(parseHeatmapResponse(value).value, context, mapping);
}
