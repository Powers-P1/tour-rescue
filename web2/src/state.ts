/**
 * Incident state is intentionally independent of the DOM and the AI provider.
 * A proposal, a document preview and a message sent by a human are different facts.
 */
export type IncidentPhase =
  | 'new' | 'searching' | 'proposals' | 'chosen' | 'draft'
  | 'sent' | 'waiting' | 'confirmed' | 'rejected' | 'stale';

export interface IncidentState {
  readonly phase: IncidentPhase;
  readonly runId: string | null;
  readonly optionIds: readonly string[];
  readonly chosenOptionId: string | null;
  /** Not set by generating a document or launching an email client. */
  readonly sentEvidence: { readonly messageId: string; readonly at: string } | null;
  readonly responseEvidence: { readonly reference: string; readonly at: string } | null;
}

export type IncidentAction =
  | { readonly type: 'start-search' }
  | { readonly type: 'search-failed' }
  | { readonly type: 'proposals-ready'; readonly runId: string; readonly optionIds: readonly string[] }
  | { readonly type: 'choose'; readonly optionId: string }
  | { readonly type: 'back-to-options' }
  | { readonly type: 'prepare-draft' }
  | { readonly type: 'back-to-choice' }
  | { readonly type: 'record-sent'; readonly messageId: string; readonly at: string }
  | { readonly type: 'await-response' }
  | { readonly type: 'record-response'; readonly outcome: 'confirmed' | 'rejected'; readonly reference: string; readonly at: string }
  | { readonly type: 'mark-stale'; readonly reference: string; readonly at: string }
  | { readonly type: 'reset' };

export function initialIncident(): IncidentState {
  return { phase: 'new', runId: null, optionIds: [], chosenOptionId: null, sentEvidence: null, responseEvidence: null };
}

function requirePhase(state: IncidentState, allowed: readonly IncidentPhase[], event: string): void {
  if (!allowed.includes(state.phase)) throw new Error(`Cannot ${event} from ${state.phase}.`);
}

function evidence(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
}

function timestamp(value: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('An ISO timestamp is required.');
  }
}

/** Only the action 'record-sent' with external proof can transition a draft to sent. */
export function transitionIncident(state: IncidentState, action: IncidentAction): IncidentState {
  switch (action.type) {
    case 'reset': return initialIncident();
    case 'start-search':
      requirePhase(state, ['new', 'proposals', 'chosen', 'draft'], action.type);
      return { ...initialIncident(), phase: 'searching' };
    case 'search-failed':
      requirePhase(state, ['searching'], action.type);
      return initialIncident();
    case 'proposals-ready':
      requirePhase(state, ['searching'], action.type);
      evidence(action.runId, 'Audit run ID');
      if (!Array.isArray(action.optionIds) || action.optionIds.length === 0 || action.optionIds.length > 3
          || action.optionIds.some(id => typeof id !== 'string' || !id.trim())
          || new Set(action.optionIds).size !== action.optionIds.length) {
        throw new Error('Expected one to three distinct, checked option IDs.');
      }
      return { ...state, phase: 'proposals', runId: action.runId, optionIds: [...action.optionIds] };
    case 'choose':
      requirePhase(state, ['proposals', 'chosen'], action.type);
      if (!state.optionIds.includes(action.optionId)) throw new Error('This option has not been evaluated.');
      return { ...state, phase: 'chosen', chosenOptionId: action.optionId };
    case 'back-to-options':
      requirePhase(state, ['chosen'], action.type);
      return { ...state, phase: 'proposals', chosenOptionId: null };
    case 'prepare-draft':
      requirePhase(state, ['chosen'], action.type);
      if (!state.chosenOptionId) throw new Error('Choose a checked option first.');
      return { ...state, phase: 'draft' };
    case 'back-to-choice':
      requirePhase(state, ['draft'], action.type);
      return { ...state, phase: 'chosen' };
    case 'record-sent':
      requirePhase(state, ['draft'], action.type);
      evidence(action.messageId, 'Delivery reference');
      timestamp(action.at);
      return { ...state, phase: 'sent', sentEvidence: { messageId: action.messageId, at: action.at } };
    case 'await-response':
      requirePhase(state, ['sent'], action.type);
      return { ...state, phase: 'waiting' };
    case 'record-response':
      requirePhase(state, ['sent', 'waiting'], action.type);
      evidence(action.reference, 'Promoter reply reference');
      timestamp(action.at);
      return { ...state, phase: action.outcome, responseEvidence: { reference: action.reference, at: action.at } };
    case 'mark-stale':
      requirePhase(state, ['sent', 'waiting'], action.type);
      evidence(action.reference, 'Stale reason');
      timestamp(action.at);
      return { ...state, phase: 'stale', responseEvidence: { reference: action.reference, at: action.at } };
  }
}

export function isFocusedRescue(phase: IncidentPhase): boolean {
  return phase !== 'new';
}
