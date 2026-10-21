/** Versioned device-local progress only: no artist, venue, audit or provider data. */
export const TOUR_STORAGE_KEY = 'tour-rescue:guided-tour:v1';
export const TOUR_STEP_COUNT = 6;
export type TourStepIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type TourStatus = 'not-started' | 'in-progress' | 'paused' | 'completed';

export interface TourProgress {
  readonly schemaVersion: 'tour-rescue.guided-tour.v1';
  readonly step: TourStepIndex;
  readonly status: TourStatus;
}

export interface TourStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type TourAction = { readonly type: 'start' | 'resume' | 'next' | 'back' | 'skip' | 'complete' }
  | { readonly type: 'go-to'; readonly step: TourStepIndex };

export function initialTourProgress(): TourProgress {
  return { schemaVersion: 'tour-rescue.guided-tour.v1', step: 0, status: 'not-started' };
}

export function isTourStep(value: unknown): value is TourStepIndex {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < TOUR_STEP_COUNT;
}

/** Corrupt or future versions never cause an automatic start or an out-of-range step. */
export function parseTourProgress(value: unknown): TourProgress {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return initialTourProgress();
  const item = value as Record<string, unknown>;
  if (item.schemaVersion !== 'tour-rescue.guided-tour.v1' || !isTourStep(item.step)
      || typeof item.status !== 'string' || !['not-started', 'in-progress', 'paused', 'completed'].includes(item.status)
      || Object.keys(item).some(key => !['schemaVersion', 'step', 'status'].includes(key))
      || (item.status === 'not-started' && item.step !== 0)
      || (item.status === 'completed' && item.step !== 5)) return initialTourProgress();
  return { schemaVersion: 'tour-rescue.guided-tour.v1', step: item.step, status: item.status as TourStatus };
}

export function loadTourProgress(storage?: TourStorage): TourProgress {
  try {
    const raw = storage?.getItem(TOUR_STORAGE_KEY);
    if (typeof raw !== 'string' || raw.length > 512) return initialTourProgress();
    return parseTourProgress(JSON.parse(raw));
  } catch { return initialTourProgress(); }
}

export function saveTourProgress(progress: TourProgress, storage?: TourStorage): boolean {
  if (!storage) return false;
  try { storage.setItem(TOUR_STORAGE_KEY, JSON.stringify(parseTourProgress(progress))); return true; }
  catch { return false; }
}

/** Navigation is bounded and completion always requires an explicit final action. */
export function transitionTourProgress(progress: TourProgress, action: TourAction): TourProgress {
  const current = parseTourProgress(progress);
  if (action.type === 'start') return { ...initialTourProgress(), status: 'in-progress' };
  if (action.type === 'resume') return { ...current, status: 'in-progress',
    step: current.status === 'completed' ? 0 : current.step };
  if (action.type === 'skip') return { ...current, status: 'paused' };
  if (action.type === 'complete') {
    if (current.step !== 5) throw new RangeError('Complete the guided tour from its final step.');
    return { ...current, status: 'completed' };
  }
  let step: TourStepIndex;
  if (action.type === 'go-to') {
    if (!isTourStep(action.step)) throw new RangeError('Unknown guided tour step.');
    step = action.step;
  } else step = Math.max(0, Math.min(5, current.step + (action.type === 'next' ? 1 : -1))) as TourStepIndex;
  return { ...current, step, status: 'in-progress' };
}
