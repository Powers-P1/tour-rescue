import type {
  ConfirmedShow, Knowledge, RepairOptionKind, ShowSchedule, TourScenario, Venue,
} from './domain.ts';
import type { FitReport } from './fit-types.ts';
import type { CheckStatus, ConstraintCheck, DrivingAllocation } from './travel-constraints.ts';

/** A proposed performance is never promoted to a confirmed commitment. */
export interface ProposedShow {
  readonly id: string;
  readonly cityId: string;
  readonly venueId: string;
  readonly schedule: ShowSchedule;
  readonly status: 'proposed';
  readonly locked: false;
}

export type EvaluatedRouteStop = ConfirmedShow | ProposedShow;

export interface EvaluatedRepairOption {
  readonly id: string;
  readonly kind: RepairOptionKind;
  readonly route: readonly EvaluatedRouteStop[];
  /** All declared checks. PASS is conditional on supplied data, not a booking. */
  readonly status: CheckStatus;
  readonly routingStatus: CheckStatus;
  /** Availability and the venue-fee ceiling only; excludes unpriced travel costs. */
  readonly venueStatus: CheckStatus;
  readonly checks: readonly ConstraintCheck[];
  readonly fit: Knowledge<number>;
  readonly venue: Knowledge<Venue>;
  readonly totalDistanceMetres: Knowledge<number>;
  readonly totalDrivingSeconds: Knowledge<number>;
  /** Signed difference from the day-off route, never folded into cultural fit. */
  readonly additionalDistanceMetres: Knowledge<number>;
  readonly additionalDrivingSeconds: Knowledge<number>;
  readonly drivingAllocations: readonly DrivingAllocation[];
}

export interface RepairReport {
  readonly schemaVersion: 'tour-rescue.repair-report.v1';
  readonly policy: 'locked-slot-three-options-v1';
  readonly scenarioId: string;
  readonly dataKind: TourScenario['dataKind'];
  readonly distanceBaselineOptionId: string;
  readonly fitReport: Knowledge<FitReport>;
  /** Stable order: replacement, detour, day-off. Failed options remain visible. */
  readonly options: readonly EvaluatedRepairOption[];
  readonly passingOptionIds: readonly string[];
  /** No winner is selected here. Breakpoint/recommendation policy belongs to PR3. */
  readonly decisionState: 'options-pass-checks' | 'needs-evidence' | 'no-feasible-option';
  readonly assumptions: readonly string[];
}
