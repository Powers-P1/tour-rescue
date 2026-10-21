import type { Knowledge } from './domain.ts';

/** Application-generated warnings, never unrestricted upstream error payloads. */
export interface EvidenceWarning {
  readonly code: string;
  readonly message: string;
  readonly queryId: string | null;
}

/** Safe request metadata for audit export; no headers, keys, IPs or response rows. */
export interface QueryEvidence {
  readonly queryId: string;
  readonly operation: 'artist-search' | 'artist-heatmap';
  readonly endpoint: '/search' | '/v2/insights';
  readonly parameters: Readonly<Record<string, string>>;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly source: 'live' | 'cache' | 'synthetic';
  readonly status: 'success' | 'failed';
  readonly httpStatus: Knowledge<number>;
  readonly responseReference: Knowledge<string>;
  /** Original successful acquisition time, including when read from private cache. */
  readonly responseRecordedAt: Knowledge<string>;
  readonly warnings: readonly EvidenceWarning[];
}
