import { createDecisionAudit, replayDecisionAudit } from '../../src/core/audit.ts';
import { parseDecisionPolicy } from '../../src/core/decision.ts';
import type { DecisionAudit } from '../../src/core/audit-types.ts';
import type { DecisionPolicy } from '../../src/core/decision-types.ts';
import type { TourScenario } from '../../src/core/domain.ts';
import { GERMANY_SCENARIO_ID, germanyDemoInputs, syntheticQueryEvidence } from '../../src/demo/germany.ts';
import type { ApiDecisionResult } from '../../worker/src/app.ts';

export type { ApiDecisionResult } from '../../worker/src/app.ts';

export interface ArtistChoice {
  readonly id: string;
  readonly name?: string;
}

/** IDs are obtained by selecting a search result; free text is never sent as an entity. */
export interface LiveSelection {
  readonly target: ArtistChoice;
  readonly comparisons: readonly ArtistChoice[];
  readonly control: ArtistChoice;
}

export interface ResultMetadata {
  readonly generatedAt?: string;
  readonly runId?: string;
}

export interface DecisionChanges {
  readonly minimumFitIndex?: number;
  readonly maxAdditionalDistanceMetres?: number;
  readonly additionalBudgetMinorUnits?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function metadata(value: ResultMetadata): { generatedAt: string; runId: string } {
  return {
    generatedAt: value.generatedAt ?? new Date().toISOString(),
    runId: value.runId ?? `browser-${crypto.randomUUID()}`,
  };
}

/** Runs the maintained synthetic fixture, without a network request or a provider key. */
export function createDemoResult(meta: ResultMetadata = {}): ApiDecisionResult {
  const inputs = germanyDemoInputs();
  const stamp = metadata(meta);
  return {
    schemaVersion: 'tour-rescue.api-result.v1', mode: 'demo', scenarioId: inputs.scenario.id,
    artists: inputs.artists,
    audit: createDecisionAudit({ ...inputs, ...stamp, mode: 'demo', candidateSet: inputs.fitInput.candidateSet,
      queries: syntheticQueryEvidence([inputs.fitInput, inputs.controlFitInput], stamp.generatedAt) }),
  };
}

/** A local what-if reuses recorded percentiles. It never pretends to refresh upstream evidence. */
export function recomputeResult(result: ApiDecisionResult, changes: DecisionChanges, meta: ResultMetadata = {}): ApiDecisionResult {
  const replay = result.audit.replay;
  const policy = parseDecisionPolicy({
    ...replay.policy,
    ...(changes.minimumFitIndex === undefined ? {} : { minimumFitIndex: changes.minimumFitIndex }),
    ...(changes.maxAdditionalDistanceMetres === undefined ? {} : { maxAdditionalDistanceMetres: changes.maxAdditionalDistanceMetres }),
  });
  let scenario: TourScenario = replay.scenario;
  if (changes.additionalBudgetMinorUnits !== undefined) {
    const existing = scenario.tour.constraints.additionalBudget;
    if (existing.status !== 'known') throw new TypeError('An unknown venue-fee currency cannot be changed implicitly.');
    scenario = { ...scenario, tour: { ...scenario.tour, constraints: { ...scenario.tour.constraints,
      additionalBudget: { status: 'known', value: { ...existing.value, minorUnits: changes.additionalBudgetMinorUnits } },
    } } };
  }
  const stamp = metadata(meta);
  // A slightly slow client clock must not place a replay before its recorded acquisition.
  const latest = Math.max(Date.parse(stamp.generatedAt), Date.parse(result.audit.generatedAt), ...result.audit.queries.map(query => Date.parse(query.completedAt)));
  const audit = createDecisionAudit({
    scenario, policy, ranges: replay.ranges,
    ...(replay.candidateSet.status === 'known' ? { candidateSet: replay.candidateSet.value } : {}),
    ...(replay.fitInput.status === 'known' ? { fitInput: replay.fitInput.value } : {}),
    ...(replay.controlFitInput.status === 'known' ? { controlFitInput: replay.controlFitInput.value } : {}),
    ...(result.audit.controlRun.status === 'unknown' ? { controlUnavailableReason: result.audit.controlRun.reason } : {}),
    queries: result.audit.queries, mode: result.mode, runId: stamp.runId,
    generatedAt: Number.isFinite(latest) ? new Date(latest).toISOString() : stamp.generatedAt,
  });
  return { ...result, audit };
}

const ENTITY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const malformed = () => new ApiError(502, 'INVALID_RESPONSE', 'The Worker returned an unsupported response. No new decision was accepted.');

function artist(value: unknown): ArtistChoice {
  if (!object(value) || typeof value.id !== 'string' || !ENTITY_ID.test(value.id)
      || (value.name !== undefined && (typeof value.name !== 'string' || value.name.trim().length === 0 || value.name.length > 500))) {
    throw malformed();
  }
  return { id: value.id.toUpperCase(), ...(typeof value.name === 'string' ? { name: value.name } : {}) };
}

export function validateLiveSelection(selection: LiveSelection): LiveSelection {
  if (!object(selection) || !Array.isArray(selection.comparisons) || selection.comparisons.length > 3) {
    throw new ApiError(400, 'INVALID_SELECTION', 'Select a target, a control and up to three comparison artists.');
  }
  let normalized: LiveSelection;
  try {
    normalized = { target: artist(selection.target), control: artist(selection.control), comparisons: selection.comparisons.map(artist) };
  } catch {
    throw new ApiError(400, 'INVALID_SELECTION', 'Choose every artist from the search results.');
  }
  const ids = [normalized.target.id, ...normalized.comparisons.map(row => row.id), normalized.control.id];
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'DUPLICATE_ARTISTS', 'Target, comparison and control artists must be distinct.');
  return normalized;
}

/** Trust the replay contract and recompute, rather than trusting result labels supplied over the wire. */
function liveResult(value: unknown, selection: LiveSelection): ApiDecisionResult {
  if (!object(value) || value.schemaVersion !== 'tour-rescue.api-result.v1' || value.mode !== 'live'
      || value.scenarioId !== GERMANY_SCENARIO_ID || !object(value.artists) || !Array.isArray(value.artists.comparisons)
      || !object(value.audit)) throw malformed();
  const target = artist(value.artists.target);
  const control = artist(value.artists.control);
  const comparisons = value.artists.comparisons.map(artist);
  if (target.id !== selection.target.id || control.id !== selection.control.id
      || comparisons.length !== selection.comparisons.length
      || comparisons.some((row, index) => row.id !== selection.comparisons[index]?.id)) throw malformed();
  let audit: DecisionAudit;
  try { audit = replayDecisionAudit(value.audit as unknown as DecisionAudit); }
  catch { throw malformed(); }
  if (audit.mode !== 'live' || audit.scenarioId !== value.scenarioId) throw malformed();
  const fit = audit.replay.fitInput;
  if (fit.status === 'known') {
    const targetProfile = fit.value.profiles.find(profile => profile.role === 'target');
    const comparisonIds = fit.value.profiles.filter(profile => profile.role === 'comparison').map(profile => profile.artistId.toUpperCase());
    if (targetProfile?.artistId.toUpperCase() !== target.id || comparisonIds.length !== comparisons.length
        || comparisonIds.some(id => !comparisons.some(row => row.id === id))) throw malformed();
  }
  if (audit.controlRun.status === 'known' && audit.controlRun.value.targetArtistId.toUpperCase() !== control.id) throw malformed();
  // The Worker returns resolved IDs. Reattach only names the user explicitly selected.
  return { schemaVersion: 'tour-rescue.api-result.v1', mode: 'live', scenarioId: value.scenarioId,
    artists: selection, audit };
}

export interface ApiClient {
  health(signal?: AbortSignal): Promise<{ readonly liveEnabled: boolean; readonly version: string }>;
  search(query: string, signal?: AbortSignal): Promise<readonly ArtistChoice[]>;
  rescue(selection: LiveSelection, policy?: DecisionPolicy, additionalBudgetMinorUnits?: number, signal?: AbortSignal): Promise<ApiDecisionResult>;
}

/** Only this module sends live requests; callers supply the public Worker URL, never a secret. */
export function createApiClient(baseURL: string, fetchImpl: typeof fetch = fetch): ApiClient {
  let base: URL;
  try { base = new URL(baseURL); } catch { throw new ApiError(0, 'INVALID_API_URL', 'The public Worker URL is not configured.'); }
  if (!['https:', 'http:'].includes(base.protocol) || base.username !== '' || base.password !== ''
      || base.search !== '' || base.hash !== '' || !['', '/'].includes(base.pathname)) {
    throw new ApiError(0, 'INVALID_API_URL', 'Use the public Worker origin without credentials, a path or URL parameters.');
  }
  async function request(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, base), {
        method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'omit',
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELLED', 'The live request was cancelled.');
      throw new ApiError(0, 'NETWORK_ERROR', 'The Worker could not be reached. Check the connection and the allowed Pages origin.');
    }
    let value: unknown;
    try { value = await response.json(); }
    catch { throw response.ok ? malformed() : new ApiError(response.status, 'HTTP_ERROR', `The Worker returned HTTP ${response.status}. No new decision was accepted.`); }
    if (!response.ok) {
      const details = object(value) && object(value.error) ? value.error : undefined;
      const retry = response.headers.get('Retry-After');
      const retryAfterSeconds = retry !== null && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry)) ? Number(retry) : undefined;
      throw new ApiError(response.status,
        typeof details?.code === 'string' ? details.code : 'HTTP_ERROR',
        typeof details?.message === 'string' ? details.message : `The Worker returned HTTP ${response.status}.`, retryAfterSeconds);
    }
    return value;
  }
  return {
    async health(signal) {
      const value = await request('/health', undefined, signal);
      if (!object(value) || value.ok !== true || typeof value.liveEnabled !== 'boolean' || typeof value.version !== 'string') throw malformed();
      return { liveEnabled: value.liveEnabled, version: value.version };
    },
    async search(query, signal) {
      const trimmed = query.trim();
      if (trimmed.length < 2 || query.length > 120 || /[\u0000-\u001f\u007f]/.test(query)) {
        throw new ApiError(400, 'INVALID_SEARCH', 'Enter 2 to 120 printable characters to search for an artist.');
      }
      const value = await request('/api/live/search', { query: trimmed }, signal);
      if (!object(value) || value.mode !== 'live' || !Array.isArray(value.artists) || value.artists.length > 100) throw malformed();
      const artists = value.artists.map(artist);
      if (new Set(artists.map(row => row.id)).size !== artists.length) throw malformed();
      return artists;
    },
    async rescue(input, policy, additionalBudgetMinorUnits, signal) {
      const selection = validateLiveSelection(input);
      if (policy !== undefined) {
        try { parseDecisionPolicy(policy); } catch { throw new ApiError(400, 'INVALID_POLICY', 'The decision thresholds must use valid integer units.'); }
        if (policy.maxAdditionalDistanceMetres > 500_000) throw new ApiError(400, 'INVALID_POLICY', 'The extra-distance cap must be within 0 to 500 km.');
      }
      if (additionalBudgetMinorUnits !== undefined && (!Number.isSafeInteger(additionalBudgetMinorUnits)
          || additionalBudgetMinorUnits < 0 || additionalBudgetMinorUnits > 150_000)) {
        throw new ApiError(400, 'INVALID_BUDGET', 'The venue-fee ceiling must be within EUR 0 to EUR 1,500.');
      }
      const value = await request('/api/live', {
        scenarioId: GERMANY_SCENARIO_ID, targetArtistId: selection.target.id,
        comparisonArtistIds: selection.comparisons.map(row => row.id), controlArtistId: selection.control.id,
        ...(policy === undefined ? {} : { policy }),
        ...(additionalBudgetMinorUnits === undefined ? {} : { additionalBudgetMinorUnits }),
      }, signal);
      return liveResult(value, selection);
    },
  };
}
