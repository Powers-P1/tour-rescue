import type { Knowledge } from './domain.ts';
import type { AffinityProfile, EvidenceProvenance, FitInput } from './fit-types.ts';

export class FitInputError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'FitInputError';
  }
}

function fail(path: string, message: string): never {
  throw new FitInputError(path, message);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
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

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(path, 'expected a finite number (no coercion)');
  }
  return value;
}

function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) fail(path, 'duplicate identifier');
}

function affinity(value: unknown, path: string): Knowledge<number> {
  const row = object(value, path);
  if (row.status === 'known') {
    return { status: 'known', value: finiteNumber(row.value, `${path}.value`) };
  }
  if (row.status === 'unknown') {
    return { status: 'unknown', reason: string(row.reason, `${path}.reason`) };
  }
  return fail(`${path}.status`, 'expected known or unknown');
}

/** Validates untrusted fixture/adapter data; does not guess missing fields. */
export function parseFitInput(value: unknown): FitInput {
  const input = object(value, 'input');
  if (input.schemaVersion !== 'tour-rescue.fit-input.v1') {
    fail('schemaVersion', 'expected tour-rescue.fit-input.v1');
  }
  const candidates = object(input.candidateSet, 'candidateSet');
  const id = string(candidates.id, 'candidateSet.id');
  const cityIds = array(candidates.cityIds, 'candidateSet.cityIds')
    .map((city, i) => string(city, `candidateSet.cityIds[${i}]`));
  if (cityIds.length === 0) fail('candidateSet.cityIds', 'must not be empty');
  unique(cityIds, 'candidateSet.cityIds');
  const universe = new Set(cityIds);

  const profiles: AffinityProfile[] = array(input.profiles, 'profiles').map((value, i) => {
    const path = `profiles[${i}]`;
    const profile = object(value, path);
    const queryId = string(profile.queryId, `${path}.queryId`);
    const artistId = string(profile.artistId, `${path}.artistId`);
    if (profile.candidateSetId !== id) fail(`${path}.candidateSetId`, 'must match the frozen candidate set');
    const role = profile.role;
    if (role !== 'target' && role !== 'comparison') fail(`${path}.role`, 'expected target or comparison');
    const weight = finiteNumber(profile.weight, `${path}.weight`);
    if (weight <= 0 || weight > 1) fail(`${path}.weight`, 'must be greater than 0 and at most 1');

    const source = object(profile.provenance, `${path}.provenance`);
    const kind = source.kind;
    if (kind !== 'synthetic' && kind !== 'recording-reference') fail(`${path}.provenance.kind`, 'expected synthetic or recording-reference');
    const reference = string(source.reference, `${path}.provenance.reference`);
    const provenance: EvidenceProvenance = kind === 'synthetic' ? { kind, reference } : {
      kind, reference,
      evidenceId: string(source.evidenceId, `${path}.provenance.evidenceId`),
      recordedAt: string(source.recordedAt, `${path}.provenance.recordedAt`),
      normalizationVersion: string(source.normalizationVersion, `${path}.provenance.normalizationVersion`),
    };
    const observations = array(profile.observations, `${path}.observations`).map((item, j) => {
      const observationPath = `${path}.observations[${j}]`;
      const row = object(item, observationPath);
      const cityId = string(row.cityId, `${observationPath}.cityId`);
      if (!universe.has(cityId)) fail(`${observationPath}.cityId`, 'city is outside the frozen candidate set');
      return { cityId, affinity: affinity(row.affinity, `${observationPath}.affinity`) };
    });
    unique(observations.map(row => row.cityId), `${path}.observations`);
    if (observations.length !== cityIds.length) {
      fail(`${path}.observations`, 'provide exactly one observation per frozen city; use unknown for missing evidence');
    }
    return { queryId, candidateSetId: id, artistId, role, weight, provenance, observations };
  });

  if (profiles.filter(profile => profile.role === 'target').length !== 1) {
    fail('profiles', 'must contain exactly one target artist');
  }
  unique(profiles.map(profile => profile.queryId), 'profiles.queryId');
  unique(profiles.map(profile => profile.artistId), 'profiles.artistId');
  const weightSum = profiles.reduce((sum, profile) => sum + profile.weight, 0);
  if (Math.abs(weightSum - 1) > 1e-12) fail('profiles.weight', 'weights must sum to 1');
  return { schemaVersion: 'tour-rescue.fit-input.v1', candidateSet: { id, cityIds }, profiles };
}
