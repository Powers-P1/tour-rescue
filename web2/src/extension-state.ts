/**
 * PR-B sample-only extensions. No supplier network calls, venue holds,
 * ticketing data, email ingestion, or route calculation is implied.
 */
export type SosStage = 'problem' | 'options' | 'quote' | 'preview-approved';
export type SosSupplierId = 'minh-backline' | 'saigon-stage-supply';
export interface SosSupplier {
  readonly id: SosSupplierId;
  readonly name: string;
  readonly estimateVnd: number;
  readonly travelMinutes: number;
  readonly source: 'illustrative-sample';
}
export const SAMPLE_SUPPLIERS: readonly SosSupplier[] = [
  { id: 'minh-backline', name: 'Minh Backline', estimateVnd: 1_800_000, travelMinutes: 35, source: 'illustrative-sample' },
  { id: 'saigon-stage-supply', name: 'Saigon Stage Supply', estimateVnd: 1_950_000, travelMinutes: 50, source: 'illustrative-sample' },
];
export interface SosSampleState {
  readonly stage: SosStage;
  readonly problem: string;
  readonly location: string;
  readonly requiredLocal: string;
  readonly budgetCapVnd: number;
  readonly selectedId: SosSupplierId;
  /** A sample approval is never a live supplier order or authorisation to transfer funds. */
  readonly sampleApproval: boolean;
}
export const initialSosSample = (): SosSampleState => ({
  stage: 'problem', problem: '22-inch kick drum head split. Need a replacement fitted by 16:00.',
  location: 'Ho Chi Minh City', requiredLocal: 'Today, 16:00 · ICT (UTC+7)',
  budgetCapVnd: 2_000_000, selectedId: 'minh-backline', sampleApproval: false,
});
/** Restore a navigation snapshot; an URL alone cannot imply sample approval. */
export function restoreSosHistory(value: unknown, stage: SosStage): SosSampleState {
  if (!value || typeof value !== 'object') return initialSosSample();
  const row = value as Record<string, unknown>;
  if (row.stage !== stage || typeof row.problem !== 'string' || !row.problem.trim() || row.problem.length > 700
    || typeof row.location !== 'string' || !row.location.trim() || row.location.length > 200
    || typeof row.requiredLocal !== 'string' || !row.requiredLocal.trim() || row.requiredLocal.length > 200
    || typeof row.budgetCapVnd !== 'number' || !Number.isSafeInteger(row.budgetCapVnd)
    || row.budgetCapVnd <= 0 || row.budgetCapVnd > 100_000_000
    || !SAMPLE_SUPPLIERS.some(supplier => supplier.id === row.selectedId)
    || typeof row.sampleApproval !== 'boolean') return initialSosSample();
  if (stage === 'preview-approved' && (!row.sampleApproval
    || SAMPLE_SUPPLIERS.find(supplier => supplier.id === row.selectedId)!.estimateVnd > row.budgetCapVnd)) return initialSosSample();
  return {stage, problem:row.problem, location:row.location, requiredLocal:row.requiredLocal,
    budgetCapVnd:row.budgetCapVnd, selectedId:row.selectedId as SosSupplierId,
    sampleApproval:stage === 'preview-approved'};
}
export function selectedSupplier(state: SosSampleState): SosSupplier {
  const found = SAMPLE_SUPPLIERS.find(provider => provider.id === state.selectedId);
  if (!found) throw new RangeError('Unknown sample supplier.');
  return found;
}
export type SosSampleAction =
  | { readonly type: 'edit-problem'; readonly problem: string; readonly location: string; readonly requiredLocal: string; readonly budgetCapVnd: number }
  | { readonly type: 'find-sample-options' }
  | { readonly type: 'choose-sample-supplier'; readonly id: SosSupplierId }
  | { readonly type: 'review-sample-quote' }
  | { readonly type: 'preview-approval' }
  | { readonly type: 'back' }
  | { readonly type: 'restart' };
export function transitionSosSample(state: SosSampleState, action: SosSampleAction): SosSampleState {
  if (action.type === 'restart') return initialSosSample();
  if (action.type === 'back') {
    if (state.stage === 'preview-approved') return { ...state, stage: 'quote', sampleApproval: false };
    if (state.stage === 'quote') return { ...state, stage: 'options' };
    if (state.stage === 'options') return { ...state, stage: 'problem' };
    return state;
  }
  if (action.type === 'edit-problem') {
    if (state.stage !== 'problem') throw new Error('The request is editable only before a new sample search.');
    if (!action.problem.trim() || !action.location.trim() || !action.requiredLocal.trim()
        || !Number.isSafeInteger(action.budgetCapVnd) || action.budgetCapVnd <= 0 || action.budgetCapVnd > 100_000_000) {
      throw new RangeError('Provide a problem, location, local deadline and positive VND budget.');
    }
    return { ...state, problem: action.problem.trim(), location: action.location.trim(),
      requiredLocal: action.requiredLocal.trim(), budgetCapVnd: action.budgetCapVnd };
  }
  if (action.type === 'find-sample-options') {
    if (state.stage !== 'problem') throw new Error('Review the sample problem first.');
    return { ...state, stage: 'options' };
  }
  if (action.type === 'choose-sample-supplier') {
    if (state.stage !== 'options' || !SAMPLE_SUPPLIERS.some(supplier => supplier.id === action.id)) {
      throw new Error('Choose a listed sample supplier.');
    }
    return { ...state, selectedId: action.id };
  }
  if (action.type === 'review-sample-quote') {
    if (state.stage !== 'options') throw new Error('Choose a sample option first.');
    return { ...state, stage: 'quote' };
  }
  if (action.type === 'preview-approval') {
    if (state.stage !== 'quote') throw new Error('Inspect the sample quote before previewing approval.');
    if (selectedSupplier(state).estimateVnd > state.budgetCapVnd) throw new Error('The sample quote exceeds your stated cap.');
    return { ...state, stage: 'preview-approved', sampleApproval: true };
  }
  return state;
}

export const SAMPLE_PLAN_BRIEF =
  '12 shows in November. Germany and Poland. Van. Max 4h driving a day. Clubs for 300–600. No Mondays.';
export interface PlanSummary {
  readonly kind: 'unverified-draft';
  readonly showCount: number | null;
  readonly drivingHourCap: number | null;
  readonly region: string;
  readonly venuePeople: string;
  readonly avoidMondays: boolean;
  readonly itinerary: readonly string[];
}
export function summarizePlanBrief(brief: string): PlanSummary {
  if (!brief.trim() || brief.length > 5_000) throw new Error('Enter a brief up to 5,000 characters.');
  const shows = /\b(\d{1,2})\s+(?:shows|concerts|gigs)\b/i.exec(brief);
  const drive = /\b(?:max(?:imum)?\s*)(\d{1,2})\s*h(?:ours?)?\b/i.exec(brief);
  const sizes = /\b(\d{2,4})\s*[-–]\s*(\d{2,4})\b/.exec(brief);
  const showCount = shows ? Number(shows[1]) : null;
  const drivingHourCap = drive ? Number(drive[1]) : null;
  if (showCount !== null && (showCount < 1 || showCount > 30)) throw new RangeError('Sample planner supports 1–30 proposed slots.');
  if (drivingHourCap !== null && (drivingHourCap < 1 || drivingHourCap > 24)) throw new RangeError('Driving cap must be 1–24 hours.');
  const regions = ['Germany', 'Poland'].filter(country => new RegExp(country, 'i').test(brief));
  return {
    kind: 'unverified-draft', showCount, drivingHourCap,
    region: regions.length ? regions.join(' + ') : 'Unknown / To confirm',
    venuePeople: sizes ? sizes[1] + '–' + sizes[2] + ' people' : 'Unknown / To confirm',
    avoidMondays: /no mondays|avoid mondays/i.test(brief),
    itinerary: ['Germany · cities to confirm', 'Border transfer · routing to confirm', 'Poland · cities to confirm'],
  };
}
export interface EconomicsAssumptions {
  readonly ticketPriceEur: number;
  readonly artistShare: number;
  readonly fixedCostsEur: number;
  readonly minAttendance: number;
  readonly maxAttendance: number;
}
export const SAMPLE_ECONOMICS: EconomicsAssumptions = {
  ticketPriceEur: 20, artistShare: .7, fixedCostsEur: 2_100,
  minAttendance: 120, maxAttendance: 180,
};
export interface EconomicsResult {
  readonly lowEur: number;
  readonly highEur: number;
  readonly breakEvenTickets: number;
  readonly verdict: 'Loss under low case' | 'Profitable in both cases' | 'Close call';
}
export function evaluateEconomics(a: EconomicsAssumptions): EconomicsResult {
  if (![a.ticketPriceEur, a.artistShare, a.fixedCostsEur, a.minAttendance, a.maxAttendance].every(Number.isFinite)
    || a.ticketPriceEur <= 0 || a.artistShare <= 0 || a.artistShare > 1 || a.fixedCostsEur < 0
    || !Number.isInteger(a.minAttendance) || !Number.isInteger(a.maxAttendance)
    || a.minAttendance < 0 || a.maxAttendance < a.minAttendance) throw new RangeError('Invalid economics assumptions.');
  const perTicket = a.ticketPriceEur * a.artistShare;
  const lowEur = Math.round((a.minAttendance * perTicket - a.fixedCostsEur) * 100) / 100;
  const highEur = Math.round((a.maxAttendance * perTicket - a.fixedCostsEur) * 100) / 100;
  return { lowEur, highEur, breakEvenTickets: Math.ceil(a.fixedCostsEur / perTicket),
    verdict: lowEur >= 0 ? 'Profitable in both cases' : highEur < 0 ? 'Loss under low case' : 'Close call' };
}
