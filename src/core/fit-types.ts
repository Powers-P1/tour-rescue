import type { Knowledge } from './domain.ts';

/** Application-owned contract, NOT a claim about the raw Qloo response schema. */
export interface CandidateSet {
  readonly id: string;
  readonly cityIds: readonly string[];
}

export interface AffinityObservation {
  readonly cityId: string;
  readonly affinity: Knowledge<number>;
}

export type EvidenceProvenance = {
  readonly kind: 'synthetic';
  readonly reference: string;
} | {
  /** A reference does not imply permission to publish the underlying data. */
  readonly kind: 'recording-reference';
  readonly reference: string;
  readonly evidenceId: string;
  readonly recordedAt: string;
  readonly normalizationVersion: string;
};

export interface AffinityProfile {
  readonly queryId: string;
  readonly candidateSetId: string;
  readonly artistId: string;
  readonly role: 'target' | 'comparison';
  /** Application model weight. Never interpreted as a Qloo GET entity weight. */
  readonly weight: number;
  readonly provenance: EvidenceProvenance;
  /** Exactly one entry per frozen city; absent evidence is explicitly unknown. */
  readonly observations: readonly AffinityObservation[];
}

export interface FitInput {
  readonly schemaVersion: 'tour-rescue.fit-input.v1';
  readonly candidateSet: CandidateSet;
  readonly profiles: readonly AffinityProfile[];
}

export interface CityIndex {
  readonly cityId: string;
  readonly value: Knowledge<number>;
}

export interface ProfilePercentiles {
  readonly queryId: string;
  readonly artistId: string;
  readonly role: AffinityProfile['role'];
  readonly weight: number;
  readonly provenance: AffinityProfile['provenance'];
  readonly informative: Knowledge<boolean>;
  readonly percentiles: readonly CityIndex[];
}

export interface FitWarning {
  readonly code: 'INSUFFICIENT_CANDIDATES' | 'INCOMPLETE_PROFILE' | 'FLAT_PROFILE' | 'FLAT_AGGREGATE';
  readonly queryId: string | null;
  readonly message: string;
}

export interface FitReport {
  readonly schemaVersion: 'tour-rescue.fit-report.v1';
  readonly method: 'weighted-midrank-v1';
  readonly candidateSet: CandidateSet;
  readonly profiles: readonly ProfilePercentiles[];
  readonly cities: readonly CityIndex[];
  readonly warnings: readonly FitWarning[];
}
