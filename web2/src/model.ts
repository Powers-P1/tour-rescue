/**
 * Read-only projection of the audited core. No values from mockup bitmaps are used
 * as live Qloo results, road measurements, venue checks or booked commitments.
 */
import type { ApiDecisionResult } from '../../worker/src/app.ts';
import type { Knowledge, TourScenario } from '../../src/core/domain.ts';
import type { CheckStatus } from '../../src/core/travel-constraints.ts';
import { replayDecisionAudit } from '../../src/core/audit.ts';

export type RescueOption = {
  readonly id: string;
  readonly kind: 'replacement' | 'detour' | 'day-off';
  readonly cityName: string;
  readonly cityId: string | null;
  readonly recommended: boolean;
  readonly reason: string;
  readonly inbound: string;
  readonly outbound: string;
  readonly relativeFit: string;
  readonly fitKnown: boolean;
  readonly routeCheck: CheckStatus;
  readonly decisionCheck: CheckStatus;
  readonly checks: readonly { readonly id: string; readonly status: CheckStatus; readonly message: string }[];
};

export interface RescueProjection {
  readonly runId: string;
  readonly mode: 'demo' | 'live';
  readonly sampleTour: true;
  readonly title: string;
  readonly artist: string;
  readonly cancelledCity: string;
  readonly cancelledDate: string;
  readonly fromCity: string;
  readonly toCity: string;
  readonly limit: string;
  readonly options: readonly RescueOption[];
  readonly sourceMessage: string;
  readonly evidence: readonly string[];
}

export const UNKNOWN = 'Unknown / To confirm';

function name(scenario: TourScenario, cityId: string): string {
  return scenario.cities.find(city => city.id === cityId)?.name ?? UNKNOWN;
}

export function duration(seconds: Knowledge<number>): string {
  if (seconds.status === 'unknown' || !Number.isFinite(seconds.value)) return UNKNOWN;
  const minutes = Math.round(seconds.value / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

function roadDuration(scenario: TourScenario, startId: string | null, endId: string | null): string {
  if (!startId || !endId) return UNKNOWN;
  if (startId === endId) return '0m';
  const leg = scenario.roadMatrix.legs.find(row => row.fromCityId === startId && row.toCityId === endId);
  return leg?.travel.status === 'known' ? duration({ status: 'known', value: leg.travel.value.durationSeconds }) : UNKNOWN;
}

function fitDisplay(value: Knowledge<number>): string {
  return value.status === 'known' ? `${value.value.toFixed(1)} / 100 · relative taste index` : UNKNOWN;
}

export function dateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

/** Replays all deterministic checks before using a remote or cached audit. */
export function projectRescue(result: ApiDecisionResult): RescueProjection {
  const audit = replayDecisionAudit(result.audit);
  const scenario = audit.replay.scenario;
  const shows = scenario.tour.shows;
  const index = shows.findIndex(show => show.status === 'cancelled');
  if (index < 0) throw new Error('There is no cancelled show in this audit.');
  const cancelled = shows[index]!;
  const previous = [...shows.slice(0, index)].reverse().find(show => show.status === 'confirmed');
  const next = shows.slice(index + 1).find(show => show.status === 'confirmed');
  const fromCity = previous ? name(scenario, previous.cityId) : UNKNOWN;
  const toCity = next ? name(scenario, next.cityId) : UNKNOWN;
  const recommendation = audit.analysis.decision.recommendation;
  const policy = audit.replay.policy;
  const options: RescueOption[] = audit.analysis.repairs.options.slice(0, 3).map(option => {
    const candidate = scenario.repairCandidates.find(row => row.id === option.id);
    const decision = audit.analysis.decision.options.find(row => row.optionId === option.id);
    if (!candidate || !decision) throw new Error('Audit options and declared candidates disagree.');
    const cityId = candidate.kind === 'day-off' ? null : candidate.cityId;
    const fitKnown = option.fit.status === 'known';
    const fitPass = fitKnown && option.fit.value >= policy.minimumFitIndex;
    const routeCheck = option.routingStatus;
    // The complete deterministic decision is authoritative, not just the travel + fit subset.
    // In particular Frankfurt can meet the fit threshold while failing the extra-distance cap.
    const failed = decision.checks.filter(check => check.status === 'FAIL');
    const unresolved = decision.checks.filter(check => check.status === 'UNKNOWN');
    const reason = failed.some(check => check.id === 'decision:additional-distance')
      ? 'Extra distance exceeds your cap. See evidence.'
      : failed.some(check => check.id === 'decision:minimum-fit')
        ? 'Relative taste fit falls below your threshold.'
        : failed.some(check => check.id === 'venue-availability')
          ? 'Supplied venue availability fails. See evidence.'
          : failed.length > 0 || decision.status === 'FAIL'
            ? 'A declared constraint fails. See evidence.'
            : decision.status === 'UNKNOWN' || unresolved.length > 0
              ? (candidate.kind === 'day-off'
                ? 'Locked dates remain. Other checks need confirmation.'
                : 'Checks need confirmation. See evidence.')
              : candidate.kind === 'day-off'
                ? 'Protect the next confirmed show. No replacement booking.'
                : routeCheck === 'UNKNOWN'
                  ? 'Route evidence needs confirmation.'
                  : !fitKnown
                    ? 'Taste fit unavailable. Evidence to confirm.'
                    : !fitPass
                      ? 'Relative taste fit falls below your threshold.'
                      : 'Taste fit meets threshold. Check the venue and terms.';
    return {
      id: option.id, kind: option.kind,
      cityId,
      cityName: candidate.kind === 'day-off' ? 'Keep the day off' : name(scenario, candidate.cityId),
      recommended: recommendation.status === 'recommended' && recommendation.optionId === option.id,
      reason,
      inbound: candidate.kind === 'day-off' ? UNKNOWN : roadDuration(scenario, previous?.cityId ?? null, cityId),
      outbound: candidate.kind === 'day-off' ? UNKNOWN : roadDuration(scenario, cityId, next?.cityId ?? null),
      relativeFit: candidate.kind === 'day-off' ? 'N/A - no show' : fitDisplay(option.fit),
      fitKnown,
      routeCheck, decisionCheck: decision.status,
      checks: decision.checks.map(check => ({ id: check.id, status: check.status, message: check.message })),
    };
  });
  if (!options.length) throw new Error('The audit has no repair options.');
  const sources = audit.sourceTimestamps;
  const liveFitQueries = audit.queries.filter(q => q.operation === 'artist-heatmap' && q.status === 'success' && q.source !== 'synthetic');
  const sourceMessage = result.mode === 'live'
    ? (liveFitQueries.length ? 'Live Qloo artist evidence. Frozen OSRM road matrix. Fictional venue and show facts.' : 'Live run attempted. Qloo fit is unresolved; see evidence.')
    : 'Sample scenario · synthetic taste data · frozen OSRM road snapshot';
  return {
    runId: audit.runId,
    mode: result.mode,
    sampleTour: true,
    title: scenario.tour.name,
    artist: result.artists.target.name || (result.mode === 'live' ? 'Selected Qloo artist' : 'Synthetic demo artist'),
    cancelledCity: name(scenario, cancelled.cityId),
    cancelledDate: dateInZone(cancelled.schedule.startsAt.iso, cancelled.schedule.startsAt.timeZone),
    fromCity, toCity,
    limit: duration({ status: 'known', value: scenario.tour.constraints.maxDailyDrivingSeconds }),
    options,
    sourceMessage,
    evidence: [
      `Fit: ${result.mode === 'live' ? 'Qloo artist query records (see audit)' : 'authored synthetic Qloo-shaped fixture, not a Qloo API response'}.`,
      `Road: ${sources.road.method} · ${sources.road.source} · recorded ${sources.road.recordedAt.status === 'known' ? sources.road.recordedAt.value.iso : 'Unknown'}.`,
      `Region: Germany frozen candidate set · ${audit.frozenCandidateSet.status === 'known' ? audit.frozenCandidateSet.value.cityIds.length : 'Unknown'} cities.`,
      `Decision thresholds: fit index ≥ ${policy.minimumFitIndex}; extra distance ≤ ${(policy.maxAdditionalDistanceMetres / 1000).toFixed(1)} km.`,
      `Checks: ${audit.zeroViolationsGate.status} for the recommended option only. Unknown checks are not PASS.`,
      `Venue and booking inputs: ${audit.scenarioDataKind}; not externally verified, no reservations or promoter messages sent.`,
    ],
  };
}
