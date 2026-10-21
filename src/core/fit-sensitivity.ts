import { computeFitIndex } from './fit-index.ts';
import type { AffinityProfile, FitInput, FitReport } from './fit-types.ts';
import { parseFitInput } from './parse-fit-input.ts';

export interface OmittedArtist {
  readonly artistId: string;
  readonly queryId: string;
  readonly weight: number;
}

export interface RetainedArtistWeight {
  readonly artistId: string;
  readonly queryId: string;
  readonly before: number;
  readonly after: number;
}

export interface ArtistOmissionInput {
  readonly removed: OmittedArtist;
  readonly retainedWeights: readonly RetainedArtistWeight[];
  readonly input: FitInput;
}

export interface ArtistOmissionFit {
  readonly removed: OmittedArtist;
  readonly retainedWeights: readonly RetainedArtistWeight[];
  readonly fitReport: FitReport;
}

export interface LeaveOneArtistOutFitReport {
  readonly schemaVersion: 'tour-rescue.leave-one-artist-out-fits.v1';
  /** The touring act remains fixed; changing it is a separate control run. */
  readonly scope: 'comparison-artists-only';
  readonly normalization: 'proportional-survivor-weights-v1';
  /** complete means runs were computed, not that all fit evidence is known. */
  readonly status: 'complete' | 'not-applicable';
  readonly reason: string;
  readonly baseline: FitReport;
  readonly runs: readonly ArtistOmissionFit[];
}

const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const compareProfiles = (a: AffinityProfile, b: AffinityProfile): number =>
  compareIds(a.artistId, b.artistId) || compareIds(a.queryId, b.queryId);

/** Canonical order only; the frozen city universe and its evidence do not change. */
function canonicalInput(value: unknown): FitInput {
  const input = parseFitInput(value);
  return {
    ...input,
    candidateSet: { ...input.candidateSet, cityIds: [...input.candidateSet.cityIds].sort(compareIds) },
    profiles: [...input.profiles].sort(compareProfiles).map(profile => ({
      ...profile,
      observations: [...profile.observations].sort((a, b) => compareIds(a.cityId, b.cityId)),
    })),
  };
}

function omissions(input: FitInput): readonly ArtistOmissionInput[] {
  return input.profiles.filter(profile => profile.role === 'comparison').map(removed => {
    const retained = input.profiles.filter(profile => profile.artistId !== removed.artistId);
    // Sum actual survivors rather than subtracting from 1: a valid generic input
    // may carry rounding error, or the omitted weight may round to exactly 1.
    const retainedTotal = retained.reduce((sum, profile) => sum + profile.weight, 0);
    const retainedWeights = retained.map(profile => ({
      artistId: profile.artistId, queryId: profile.queryId,
      before: profile.weight, after: profile.weight / retainedTotal,
    }));
    const normalized = parseFitInput({
      ...input,
      profiles: retained.map((profile, index) => ({ ...profile, weight: retainedWeights[index]!.after })),
    });
    return {
      removed: { artistId: removed.artistId, queryId: removed.queryId, weight: removed.weight },
      retainedWeights,
      input: normalized,
    };
  });
}

/**
 * Pure counterfactual inputs for omitting each comparison artist once.
 * The target is never omitted, cities are never dropped and missing affinity is
 * never filled. Surviving model weights are explicitly renormalized; the default
 * scenario 50/50 policy is deliberately not reapplied to an ablation.
 */
export function buildLeaveOneArtistOutInputs(value: unknown): readonly ArtistOmissionInput[] {
  return omissions(canonicalInput(value));
}

/** Fit-only sensitivity evidence, ready for decision comparison and PR4 audit. */
export function computeLeaveOneArtistOutFits(value: unknown): LeaveOneArtistOutFitReport {
  const input = canonicalInput(value);
  const runs = omissions(input).map(run => ({
    removed: run.removed,
    retainedWeights: run.retainedWeights,
    fitReport: computeFitIndex(run.input),
  }));
  return {
    schemaVersion: 'tour-rescue.leave-one-artist-out-fits.v1',
    scope: 'comparison-artists-only', normalization: 'proportional-survivor-weights-v1',
    status: runs.length === 0 ? 'not-applicable' : 'complete',
    reason: runs.length === 0 ? 'No comparison artist is present; the target artist is never omitted.' :
      'Each comparison artist is omitted once; UNKNOWN fit remains visible and the target and frozen city universe remain fixed.',
    baseline: computeFitIndex(input),
    runs,
  };
}
