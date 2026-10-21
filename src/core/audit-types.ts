import type { Knowledge, TourScenario, TourShow, ZonedDateTime } from './domain.ts';
import type { CandidateSet, FitInput } from './fit-types.ts';
import type { DecisionReport } from './decision-types.ts';
import type { TourDecisionAnalysis } from './decision-analysis.ts';
import type { EvaluatedRouteStop, RepairReport } from './repair-types.ts';
import type { CheckStatus, ConstraintCheck } from './travel-constraints.ts';
import type { EvidenceWarning, QueryEvidence } from './evidence-types.ts';

export interface CreateDecisionAuditInput {
  readonly scenario: unknown;
  /** Keeps the frozen universe explicit even if acquisition fails before fit can be built. */
  readonly candidateSet?: unknown;
  readonly fitInput?: unknown;
  readonly controlFitInput?: unknown;
  readonly controlUnavailableReason?: string;
  readonly policy: unknown;
  readonly ranges: unknown;
  readonly queries: readonly QueryEvidence[];
  /** Supplied by the caller; the pure core never reads the clock. */
  readonly generatedAt: string;
  readonly runId: string;
  readonly mode: 'demo' | 'live';
}

export interface ZeroViolationsGate {
  readonly scope: 'recommended-option-declared-checks';
  readonly status: CheckStatus;
  readonly optionId: Knowledge<string>;
  readonly violatedCheckCount: Knowledge<number>;
  readonly unresolvedCheckCount: Knowledge<number>;
  readonly failedCheckIds: readonly string[];
  readonly unknownCheckIds: readonly string[];
  readonly reason: string;
}

export type AuditStop = TourShow | EvaluatedRouteStop;

export interface StopChange {
  readonly showId: string;
  readonly kind: 'added' | 'removed' | 'modified';
  readonly before: Knowledge<AuditStop>;
  readonly after: Knowledge<AuditStop>;
  readonly changedFields: readonly string[];
}

export interface RouteChangeReport {
  readonly beforeStopCount: number;
  readonly afterStopCount: number;
  readonly changedStopCount: number;
  readonly changes: readonly StopChange[];
}

export interface OptionStopChanges extends RouteChangeReport {
  readonly optionId: string;
  readonly unchangedLockedShowIds: readonly string[];
  readonly lockedCommitments: ConstraintCheck;
}

export interface ControlAuditRun {
  readonly targetArtistId: string;
  readonly repairs: RepairReport;
  readonly decision: DecisionReport;
  readonly zeroViolationsGate: ZeroViolationsGate;
  readonly recommendedOptionChanged: Knowledge<boolean>;
}

export interface DecisionAudit {
  readonly schemaVersion: 'tour-rescue.decision-audit.v1';
  readonly runId: string;
  readonly generatedAt: string;
  readonly mode: 'demo' | 'live';
  readonly scenarioId: string;
  readonly scenarioDataKind: TourScenario['dataKind'];
  readonly frozenCandidateSet: Knowledge<CandidateSet>;
  readonly queries: readonly QueryEvidence[];
  readonly warnings: readonly EvidenceWarning[];
  readonly sourceTimestamps: {
    readonly road: {
      readonly matrixId: string;
      readonly source: string;
      readonly method: TourScenario['roadMatrix']['provenance']['method'];
      readonly recordedAt: Knowledge<ZonedDateTime>;
    };
    readonly qloo: readonly {
      readonly queryId: string;
      readonly artistId: string;
      readonly source: QueryEvidence['source'];
      readonly responseReference: Knowledge<string>;
      readonly recordedAt: Knowledge<string>;
    }[];
  };
  readonly analysis: TourDecisionAnalysis;
  readonly controlRun: Knowledge<ControlAuditRun>;
  readonly stopChanges: {
    readonly originalToOptions: readonly OptionStopChanges[];
    readonly recommendedBaselineToControl: Knowledge<RouteChangeReport>;
  };
  readonly zeroViolationsGate: ZeroViolationsGate;
  readonly replay: {
    readonly schemaVersion: 'tour-rescue.rank-replay.v1';
    /** Only within-query order/ties and missingness are retained, not raw Qloo affinities. */
    readonly fitRepresentation: 'within-query-percentiles-preserving-missingness';
    readonly scenario: TourScenario;
    readonly candidateSet: Knowledge<CandidateSet>;
    readonly policy: DecisionReport['policy'];
    readonly ranges: TourDecisionAnalysis['breakpoints']['ranges'];
    readonly fitInput: Knowledge<FitInput>;
    readonly controlFitInput: Knowledge<FitInput>;
  };
}
