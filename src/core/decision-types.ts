import type { RepairOptionKind } from './domain.ts';
import type { CheckStatus, ConstraintCheck } from './travel-constraints.ts';

/** Declared user preferences; neither threshold is a learned confidence value. */
export interface DecisionPolicy {
  readonly schemaVersion: 'tour-rescue.decision-policy.v1';
  /** Integer fit-index points, 0..100; scores themselves retain full precision. */
  readonly minimumFitIndex: number;
  /** Non-negative safe integer metres above the day-off route. */
  readonly maxAdditionalDistanceMetres: number;
}

export type Recommendation = {
  readonly status: 'recommended';
  readonly optionId: string;
  readonly kind: RepairOptionKind;
  readonly reason: string;
} | {
  readonly status: 'needs-evidence';
  readonly reason: string;
} | {
  readonly status: 'no-feasible-option';
  readonly reason: string;
};

export interface DecisionOptionEvaluation {
  readonly optionId: string;
  readonly kind: RepairOptionKind;
  readonly status: CheckStatus;
  /** Original feasibility checks plus independent fit and travel preference gates. */
  readonly checks: readonly ConstraintCheck[];
}

export interface DecisionReport {
  readonly schemaVersion: 'tour-rescue.decision-report.v1';
  readonly policy: DecisionPolicy;
  readonly recommendation: Recommendation;
  readonly options: readonly DecisionOptionEvaluation[];
  /** Known eligible shows, even when another unresolved show prevents a recommendation. */
  readonly rankedShowOptionIds: readonly string[];
  readonly tieBreak: 'fit' | 'additional-distance' | 'option-id' | 'day-off' | 'not-applicable';
}
