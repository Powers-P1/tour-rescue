import type { AffinityProfile, CandidateSet } from '../core/fit-types.ts';
import type { EvidenceWarning } from '../core/evidence-types.ts';
import type { CityCells } from './geo.ts';

/** Context recorded by our adapter; these names are NOT Qloo query parameters. */
export interface NormalizationContext {
  readonly candidateSet: CandidateSet;
  readonly queryId: string;
  readonly artistId: string;
  readonly role: AffinityProfile['role'];
  readonly weight: number;
  readonly provenance: AffinityProfile['provenance'];
}

export interface NormalizedHeatmap {
  readonly profile: AffinityProfile;
  readonly warnings: readonly EvidenceWarning[];
}

/** Raw response fields are checked against the documented heatmap envelope before geometry mapping. */
export type NormalizeHeatmap = (response: unknown, context: NormalizationContext, mapping: CityCells) => NormalizedHeatmap;
