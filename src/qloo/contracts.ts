import type { AffinityProfile, CandidateSet } from '../core/fit-types.ts';

/** Context recorded by our adapter; these names are NOT Qloo query parameters. */
export interface NormalizationContext {
  readonly candidateSet: CandidateSet;
  readonly queryId: string;
  readonly artistId: string;
  readonly role: AffinityProfile['role'];
  readonly weight: number;
  readonly provenance: AffinityProfile['provenance'];
}

/**
 * The raw heatmap schema is UNKNOWN until a maintainer supplies an approved probe.
 * An implementation must map cities explicitly and emit unknown for absent evidence.
 * No network client or speculative raw-response parser is implemented in PR1.
 */
export type NormalizeHeatmap = (response: unknown, context: NormalizationContext) => AffinityProfile;
