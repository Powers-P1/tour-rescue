import type { Knowledge } from './domain.ts';
import { computeFitIndex } from './fit-index.ts';
import type { FitInput, FitReport } from './fit-types.ts';
import { FitInputError, parseFitInput } from './parse-fit-input.ts';

const WEIGHT_TOLERANCE = 1e-12;

/** The scenario policy is intentionally separate from arbitrary leave-one-out weights. */
export function parseScenarioFitInput(value: unknown): FitInput {
  const input = parseFitInput(value);
  const comparisons = input.profiles.filter(profile => profile.role === 'comparison').length;
  for (const [i, profile] of input.profiles.entries()) {
    const expected = profile.role === 'target' ? (comparisons === 0 ? 1 : 0.5) : 0.5 / comparisons;
    if (Math.abs(profile.weight - expected) > WEIGHT_TOLERANCE) {
      throw new FitInputError(`profiles[${i}].weight`, profile.role === 'target'
        ? `scenario target weight must be ${expected}`
        : `scenario comparison weights must each be 0.5 / ${comparisons}`);
    }
  }
  return input;
}

export function computeScenarioFitIndex(value: unknown): FitReport {
  return computeFitIndex(parseScenarioFitInput(value));
}

function fail(path: string, message: string): never {
  throw new FitInputError(path, message);
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

function syntheticAffinity(value: unknown, path: string): Knowledge<number> {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { status: 'known', value };
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const unknown = value as Record<string, unknown>;
    if (unknown.status === 'unknown') {
      return { status: 'unknown', reason: string(unknown.reason, `${path}.reason`) };
    }
  }
  return fail(path, 'expected a finite affinity or explicit { status: "unknown", reason }; missing values are not zero');
}

/**
 * Adapter ONLY for fixtures/qloo/heatmap_de_synthetic.json's local envelope.
 * cityId is our synthetic annotation, not a Qloo field or verified locality map.
 * queryId becomes a local synthetic artist ID; no placeholder is resolved here.
 * The first query freezes the city universe; all other queries must match it.
 * Numeric query.affinity is used; rank, popularity and locations are ignored.
 * An explicit unknown object is our local extension for missing synthetic evidence,
 * not a claimed raw API field. Missing rows/values are rejected, never filled in.
 */
export function parseSyntheticHeatmapFitInput(value: unknown): FitInput {
  const input = object(value, 'syntheticHeatmap');
  if (input.schemaVersion !== 1) fail('schemaVersion', 'expected 1');
  if (input.dataKind !== 'synthetic') fail('dataKind', 'expected synthetic; this is not a live Qloo adapter');
  const id = string(input.id, 'id');
  const metadata = object(input.metadata, 'metadata');
  if (metadata.synthetic !== true) fail('metadata.synthetic', 'must explicitly be true');
  if (metadata.no_raw_api_data !== true) fail('metadata.no_raw_api_data', 'must explicitly be true');
  const candidateSetId = string(metadata.candidateSetId, 'metadata.candidateSetId');
  const queries = Array.from(array(input.queries, 'queries'), (value, i) => {
    const path = `queries[${i}]`;
    const query = object(value, path);
    if (query.synthetic !== true) fail(`${path}.synthetic`, 'must explicitly be true');
    const queryId = string(query.queryId, `${path}.queryId`);
    if (query.role !== 'main' && query.role !== 'comparison') fail(`${path}.role`, 'expected main or comparison');
    const role = query.role === 'main' ? 'target' as const : 'comparison' as const;
    const observations = Array.from(array(query.heatmap, `${path}.heatmap`), (value, j) => {
      const rowPath = `${path}.heatmap[${j}]`;
      const row = object(value, rowPath);
      const cityId = string(row.cityId, `${rowPath}.cityId`);
      const query = object(row.query, `${rowPath}.query`);
      return { cityId, affinity: syntheticAffinity(query.affinity, `${rowPath}.query.affinity`) };
    });
    return { queryId, role, observations };
  });
  if (queries.length === 0) fail('queries', 'must contain a main query');
  const comparisons = queries.filter(query => query.role === 'comparison').length;
  return parseScenarioFitInput({
    schemaVersion: 'tour-rescue.fit-input.v1',
    candidateSet: { id: candidateSetId, cityIds: queries[0]!.observations.map(row => row.cityId) },
    profiles: queries.map(query => ({
      ...query, candidateSetId, artistId: query.queryId,
      weight: query.role === 'target' ? (comparisons === 0 ? 1 : 0.5) : 0.5 / comparisons,
      provenance: { kind: 'synthetic', reference: `fixtures/qloo/heatmap_de_synthetic.json:${id}/${query.queryId}` },
    })),
  });
}
