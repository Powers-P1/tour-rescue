/**
 * Application domain, not a Qloo response contract.
 *
 * PR1 defines data only. PR2 must validate the documented integer, time-zone,
 * reference-integrity and cardinality rules before evaluating a route.
 */

export type Known<T> = {
  readonly status: "known";
  readonly value: T;
};

export type Unknown = {
  readonly status: "unknown";
  readonly reason: string;
};

/** Missing evidence is explicit; it must never become zero, false or a pass. */
export type Knowledge<T> = Known<T> | Unknown;

/** Stable application IDs. These are not Qloo entity IDs. */
export type CityId = string;
export type VenueId = string;
export type ShowId = string;

/** Non-negative integer units; runtime validation belongs to PR2. */
export type Metres = number;
export type Seconds = number;
export type MinorCurrencyUnits = number;

export type Money = {
  /** ISO 4217 code, for example PLN; no implicit currency conversion. */
  readonly currency: string;
  readonly minorUnits: MinorCurrencyUnits;
};

export type ZonedDateTime = {
  /** ISO 8601 with an explicit numeric offset, e.g. 2026-11-10T20:00:00+01:00. */
  readonly iso: string;
  /** IANA identifier, e.g. Europe/Warsaw; its offset must agree with `iso`. */
  readonly timeZone: string;
};

export type City = {
  readonly id: CityId;
  readonly name: string;
  readonly countryCode: string;
  readonly timeZone: string;
  /** Only populate after resolving the city through a verified Qloo contract. */
  readonly qlooEntityId: Knowledge<string>;
};

export type VenueAvailability = {
  /** Local calendar date (YYYY-MM-DD) in the specified IANA time zone. */
  readonly localDate: string;
  readonly timeZone: string;
  readonly available: boolean;
};

export type Venue = {
  readonly id: VenueId;
  readonly cityId: CityId;
  readonly name: string;
  readonly qlooEntityId: Knowledge<string>;
  /** Date-specific booking evidence supplied by the booker, never by Qloo. */
  readonly availability: Knowledge<VenueAvailability>;
  /** Positive integer people, when known. */
  readonly capacityPeople: Knowledge<number>;
  readonly fee: Knowledge<Money>;
  readonly promoterTerms: Knowledge<string>;
};

export type ShowSchedule = {
  readonly arriveBy: ZonedDateTime;
  readonly startsAt: ZonedDateTime;
  readonly endsAt: ZonedDateTime;
  readonly departAfter: ZonedDateTime;
};

type ShowBase = {
  readonly id: ShowId;
  readonly cityId: CityId;
  readonly venueId: VenueId;
  readonly schedule: ShowSchedule;
};

export type ConfirmedShow = ShowBase & {
  readonly status: "confirmed";
  /** Every surviving confirmed date is immutable in the MVP. */
  readonly locked: true;
};

export type CancelledShow = ShowBase & {
  readonly status: "cancelled";
  readonly locked: false;
  readonly reason: string;
};

export type TourShow = ConfirmedShow | CancelledShow;

/** Exactly five input dates; exactly one cancelled date is a PR2 runtime rule. */
export type FiveShowTour = readonly [
  TourShow,
  TourShow,
  TourShow,
  TourShow,
  TourShow,
];

export type RouteConstraints = {
  /** Daily driving is accumulated in this single explicit IANA time zone. */
  readonly drivingDayTimeZone: string;
  readonly maxDailyDrivingSeconds: Seconds;
  /** Geographic spacing policy is declared explicitly, not inferred from taste. */
  readonly minimumMarketSpacingMetres: Metres;
  /** PR1 uses road distance; the precise directional policy is settled in PR2. */
  readonly marketSpacingMeasure: "road-distance";
  readonly additionalBudget: Knowledge<Money>;
};

export type Tour = {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly shows: FiveShowTour;
  readonly constraints: RouteConstraints;
};

export type RoadDataQuality = "recorded-road" | "estimate";

export type RoadTravel = {
  readonly distanceMetres: Metres;
  readonly durationSeconds: Seconds;
};

export type RoadMatrixProvenance = {
  readonly source: string;
  readonly method: "osrm-table" | "osrm-route" | "manual-estimate" | "synthetic-fixture";
  /** A real recording time only; synthetic values have no recording timestamp. */
  readonly recordedAt: Knowledge<ZonedDateTime>;
  readonly description: string;
};

export type DirectedRoadLeg = {
  readonly fromCityId: CityId;
  readonly toCityId: CityId;
  readonly quality: RoadDataQuality;
  readonly travel: Knowledge<RoadTravel>;
};

export type RoadMatrix = {
  readonly id: string;
  readonly directed: true;
  readonly provenance: RoadMatrixProvenance;
  /**
   * Sparse is allowed. A missing A -> B is UNKNOWN, even if B -> A exists.
   * Never fill missing legs with Haversine or silently assume symmetry.
   */
  readonly legs: readonly DirectedRoadLeg[];
};

export type RepairOptionKind = "replacement" | "detour" | "day-off";

export type ShowRepairCandidate = {
  readonly id: string;
  readonly kind: "replacement" | "detour";
  readonly cancelledShowId: ShowId;
  readonly cityId: CityId;
  readonly venueId: VenueId;
  /** The proposed show keeps the cancelled slot's schedule in this MVP. */
  readonly schedule: ShowSchedule;
};

export type DayOffCandidate = {
  readonly id: string;
  readonly kind: "day-off";
  readonly cancelledShowId: ShowId;
};

/** Inputs for PR2 option generation, not verified or recommended bookings. */
export type RepairCandidate = ShowRepairCandidate | DayOffCandidate;

export type TourScenario = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly dataKind: "synthetic" | "user-supplied";
  readonly description: string;
  readonly tour: Tour;
  readonly cities: readonly City[];
  readonly venues: readonly Venue[];
  readonly roadMatrix: RoadMatrix;
  readonly repairCandidates: readonly RepairCandidate[];
};
