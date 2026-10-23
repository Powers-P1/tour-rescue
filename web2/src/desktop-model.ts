/**
 * PR-C projections only. Qloo rank evidence, fan interest and agency samples
 * never share a numeric source. No booking, confirmation or venue availability
 * can be inferred from an affinity percentile.
 */
import citiesFixture from '../../fixtures/cities_de.json' with { type: 'json' };
import type { ApiDecisionResult } from '../../worker/src/app.ts';
import type { Knowledge } from '../../src/core/domain.ts';
import type { CheckStatus } from '../../src/core/travel-constraints.ts';
import { recomputeResult } from '../../web/src/data.ts';
import { projectRescue } from './model.ts';
import { UNKNOWN, duration, dateInZone } from './model.ts';

export type AudienceSource = 'qloo' | 'fans';
export interface AudiencePlace {
  readonly cityId: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly fit: Knowledge<number>;
  readonly relativeLabel: string;
  /** Only nominated scenarios have a deterministic route evaluation. */
  readonly routeOptionId: string | null;
}
export interface AudienceModel {
  readonly source: 'live-qloo-percentiles' | 'live-fit-unresolved' | 'synthetic-taste-fixture';
  readonly runId: string;
  readonly scopeLabel: string;
  readonly places: readonly AudiencePlace[];
  readonly fanCollectionEnabled: false;
}

const coordinates = new Map(citiesFixture.cities.map(city => [
  city.id, { lat: city.lat, lon: city.lon },
] as const));

export function relativeFitLabel(fit: Knowledge<number>): string {
  if (fit.status === 'unknown') return UNKNOWN;
  if (fit.value >= 66) return 'High relative fit';
  if (fit.value >= 33) return 'Moderate relative fit';
  return 'Lower relative fit';
}
export function projectAudience(result: ApiDecisionResult): AudienceModel {
  const audit = result.audit;
  const scenario = audit.replay.scenario;
  const options = scenario.repairCandidates.filter(c => c.kind !== 'day-off');
  const ids = options.map(option => option.cityId);
  const fitReport = audit.analysis.repairs.fitReport;
  const all = fitReport.status === 'known' ? fitReport.value.cities : [];
  const fitById = new Map(all.map(entry => [entry.cityId, entry.value]));
  const locked = new Set(scenario.tour.shows.map(show => show.cityId));
  const extra = all
    .filter(city => !ids.includes(city.cityId) && !locked.has(city.cityId))
    .sort((a,b) => (b.value.status === 'known' ? b.value.value : -1) -
      (a.value.status === 'known' ? a.value.value : -1))
    .find(city => coordinates.has(city.cityId))?.cityId;
  // Even when acquisition fails, keep the frozen geography and explicit UNKNOWN.
  const selectedIds = [...ids, ...(extra ? [extra] : [])].slice(0,3);
  const places = selectedIds.map(cityId => {
    const city = scenario.cities.find(candidate => candidate.id === cityId);
    const coord = coordinates.get(cityId);
    if (!city || !coord) throw new Error('An audience city is outside the frozen German location catalogue.');
    const fit = fitById.get(cityId) ?? { status: 'unknown' as const, reason: 'No city-level Qloo fit is available.' };
    return {
      cityId, name: city.name, lat: coord.lat, lon: coord.lon, fit,
      relativeLabel: relativeFitLabel(fit),
      routeOptionId: options.find(option => option.cityId === cityId)?.id ?? null,
    };
  });
  if (!places.length) throw new Error('Expected nominated cities from the checked core scenario.');
  return {
    source: result.mode === 'demo' ? 'synthetic-taste-fixture' :
      fitReport.status === 'known' && fitReport.value.cities.some(row => row.value.status === 'known') &&
      audit.queries.some(query => query.operation === 'artist-heatmap' &&
        query.source !== 'synthetic' && query.status === 'success')
        ? 'live-qloo-percentiles' : 'live-fit-unresolved',
    runId: audit.runId, scopeLabel: scenario.tour.region + ' · 24 frozen candidates',
    places, fanCollectionEnabled: false,
  };
}

export interface SimCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly explanation: string;
}
export interface SimulationModel {
  readonly sourceResult: ApiDecisionResult;
  readonly beforeRecommendation: { readonly optionId: string|null; readonly name: string; readonly reason: string };
  readonly afterRecommendation: { readonly optionId: string|null; readonly name: string; readonly reason: string };
  readonly originalDistanceCapKm: number;
  readonly recommendationChanged: boolean;
  readonly optionId: string;
  readonly dayOff:boolean;
  readonly cityName: string;
  readonly fromCity: string;
  readonly toCity: string;
  readonly fromDate: string;
  readonly changedDate: string;
  readonly toDate: string;
  readonly inbound: string;
  readonly outbound: string;
  readonly totalDriving: string;
  readonly difference: string;
  readonly maxDailyDriving: string;
  readonly maxAdditionalDistanceKm: number;
  readonly verdict: CheckStatus;
  readonly checks: readonly SimCheck[];
  readonly baseline: string;
  readonly status: 'PROPOSED / NOT BOOKED';
}
function signedDuration(value: Knowledge<number>): string {
  if (value.status === 'unknown') return UNKNOWN;
  return (value.value > 0 ? '+' : value.value < 0 ? '−' : '') +
    duration({ status: 'known', value: Math.abs(value.value) });
}
export function projectSimulation(
  base: ApiDecisionResult, optionId: string, maxAdditionalDistanceKm: number,
): SimulationModel {
  if (!Number.isFinite(maxAdditionalDistanceKm) || maxAdditionalDistanceKm < 0 || maxAdditionalDistanceKm > 500 ||
    Math.abs(Math.round(maxAdditionalDistanceKm * 1000)-maxAdditionalDistanceKm * 1000)>1e-7) {
    throw new RangeError('Additional distance must be 0–500 km in 1-metre increments.');
  }
  const baseline = projectRescue(base);
  const candidate = base.audit.replay.scenario.repairCandidates.find(row => row.id === optionId);
  if (!candidate) throw new RangeError('Choose an audited show direction or day off.');
  const selected = baseline.options.find(row => row.id === optionId);
  if (!selected) throw new Error('Selected option is not in the frozen decision.');
  const scenario = base.audit.replay.scenario;
  const revised = recomputeResult(base, { maxAdditionalDistanceMetres: Math.round(maxAdditionalDistanceKm * 1000) });
  const summarize = (source: ApiDecisionResult) => {
    const recommendation = source.audit.analysis.decision.recommendation;
    const id = recommendation.status === 'recommended' ? recommendation.optionId : null;
    return { optionId: id, name: id ? projectRescue(source).options.find(row => row.id === id)?.cityName ?? UNKNOWN
      : recommendation.status === 'needs-evidence' ? 'UNKNOWN · more evidence needed' : 'No feasible option',
      reason: recommendation.reason };
  };
  const beforeRecommendation = summarize(base), afterRecommendation = summarize(revised);
  const option = revised.audit.analysis.repairs.options.find(row => row.id === optionId);
  const decision = revised.audit.analysis.decision.options.find(row => row.optionId === optionId);
  if (!option || !decision) throw new Error('Recomputed audit has no selected option.');
  const original = scenario.tour.shows;
  const cancelledIndex = original.findIndex(show => show.status === 'cancelled');
  const cancelled = original[cancelledIndex];
  if (!cancelled) throw new Error('Scenario has no cancelled date.');
  const prior = [...original.slice(0, cancelledIndex)].reverse().find(show => show.status === 'confirmed');
  const next = original.slice(cancelledIndex + 1).find(show => show.status === 'confirmed');
  if (!prior || !next) throw new Error('Need confirmed shows adjacent to the cancellation.');
  const localDate = (show: { schedule: { startsAt: { iso: string; timeZone: string } } }) =>
    dateInZone(show.schedule.startsAt.iso, show.schedule.startsAt.timeZone);
  const extraDistanceCheck = decision.checks.find(check => check.id === 'decision:additional-distance');
  const venueCheck = decision.checks.find(check => check.id === 'venue-availability');
  // The core aggregate covers road evidence, arrival windows, daily budgets and spacing.
  // Passing a subset of daily-driving checks never certifies the whole route.
  const routeStatus = option.routingStatus;
  const capacity = option.venue.status === 'known' ? option.venue.value.capacityPeople : {status:'unknown' as const,reason:'No venue selected.'};
  const checks: SimCheck[] = [
    { id:'driving', label:'Driving windows / shared daily limit', status:routeStatus,
      explanation: 'Daily limit ' + duration({status:'known',value:scenario.tour.constraints.maxDailyDrivingSeconds}) +
        '; combined driving / arrival checks remain in the audit.' },
    { id:'capacity', label:'Venue capacity', status:candidate.kind==='day-off'?'PASS':'UNKNOWN',
      explanation: candidate.kind==='day-off'?'Not applicable: no added show or venue.':capacity.status === 'known' ?
        'Scenario capacity ' + capacity.value + ' people. Not externally verified.' : 'Room size and capacity: ' + UNKNOWN },
    { id:'venue', label:'Venue and date', status: candidate.kind==='day-off'?'PASS':venueCheck?.status === 'FAIL' ? 'FAIL' : 'UNKNOWN',
      explanation: candidate.kind==='day-off'?'No booking, fee or venue required for a day off.':'Synthetic input only. Real availability, booking and promoter terms: ' + UNKNOWN },
    { id:'distance', label:'Extra distance preference', status:extraDistanceCheck?.status ?? 'UNKNOWN',
      explanation: extraDistanceCheck?.message ?? 'No distance evidence available.' },
  ];
  return {
    sourceResult: revised, beforeRecommendation, afterRecommendation,
    originalDistanceCapKm: base.audit.replay.policy.maxAdditionalDistanceMetres / 1000,
    recommendationChanged: beforeRecommendation.optionId !== afterRecommendation.optionId ||
      base.audit.analysis.decision.recommendation.status !== revised.audit.analysis.decision.recommendation.status,
    optionId,dayOff:candidate.kind==='day-off',cityName: selected.cityName,
    fromCity: baseline.fromCity, toCity: baseline.toCity, fromDate:localDate(prior),
    changedDate:localDate(cancelled), toDate:localDate(next),
    inbound:selected.inbound, outbound:selected.outbound,
    totalDriving:duration(option.totalDrivingSeconds),
    difference:signedDuration(option.additionalDrivingSeconds),
    maxDailyDriving:duration({status:'known',value:scenario.tour.constraints.maxDailyDrivingSeconds}),
    maxAdditionalDistanceKm, verdict:decision.status, checks,
    baseline:baseline.fromCity+' → '+baseline.cancelledCity+' → '+baseline.toCity,
    status:'PROPOSED / NOT BOOKED',
  };
}

export const SIM_DRAFT_KEY = 'tour-rescue:web2:simulation:v1';
export interface SavedSimulation {
  readonly schemaVersion:'tour-rescue.web2-sim-draft.v1';
  readonly baseRunId:string;
  readonly optionId:string;
  readonly extraKm:number;
}
export function saveSimulation(
  storage:{setItem(key:string,value:string):void}, draft:SavedSimulation,
): void {
  if (draft.schemaVersion !== 'tour-rescue.web2-sim-draft.v1' || !draft.baseRunId.trim() ||
      !draft.optionId.trim() || !Number.isFinite(draft.extraKm) || draft.extraKm<0 || draft.extraKm>500) {
    throw new TypeError('Invalid simulation draft.');
  }
  storage.setItem(SIM_DRAFT_KEY,JSON.stringify(draft));
}
export function loadSimulation(
  storage:{getItem(key:string):string|null}, expectedRunId:string,
): SavedSimulation|null {
  try {
    const raw=storage.getItem(SIM_DRAFT_KEY);
    if(!raw||raw.length>1000)return null;
    const data:unknown=JSON.parse(raw);
    if(!data||typeof data!=='object'||Array.isArray(data))return null;
    const value=data as Record<string,unknown>;
    if(value.schemaVersion!=='tour-rescue.web2-sim-draft.v1' || value.baseRunId!==expectedRunId ||
       typeof value.optionId!=='string' || typeof value.extraKm!=='number' ||
       !Number.isFinite(value.extraKm) || value.extraKm<0||value.extraKm>500)return null;
    return {schemaVersion:'tour-rescue.web2-sim-draft.v1',baseRunId:expectedRunId,
      optionId:value.optionId,extraKm:value.extraKm};
  }catch{return null;}
}

export type AgencyOwner='Unassigned'|'Marta'|'You'|'Alex';
export interface AgencyTask {
  readonly id:'drum'|'leipzig'|'presale';
  readonly artist:string;
  readonly tour:string;
  readonly issue:string;
  readonly detail:string;
  readonly owner:AgencyOwner;
  readonly deadline:string;
  readonly action:string;
}
const AGENCY_TASKS:readonly AgencyTask[]=[
  {id:'drum',artist:'Paper Satellites',tour:'Vietnam leg',issue:'Replacement drum head needed',
    detail:'Ho Chi Minh City · fitting and delivery',owner:'Marta',deadline:'Today, 16:00 · ICT',action:'Open SOS'},
  {id:'leipzig',artist:'Northbound',tour:'Europe 2026',issue:'Leipzig canceled',
    detail:'Three checked directions in the existing core',owner:'You',deadline:'14 Nov · CET (sample)',
    action:'Rescue date'},
  {id:'presale',artist:'Night Ferry',tour:'Germany dates',issue:'Presale below plan',
    detail:'Decide on a local promo push',owner:'Unassigned',deadline:'Today · CET (sample)',
    action:'Assign owner'},
];
export function agencyTasks(owners:Readonly<Partial<Record<AgencyTask['id'],AgencyOwner>>> = {}): readonly AgencyTask[]{
  return AGENCY_TASKS.map(item=>({...item,owner:owners[item.id]??item.owner}));
}
export const AGENCY_FOURTH_TOUR={name:'Glass Index',status:'No open items · fictional sample'};
