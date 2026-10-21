import { replayDecisionAudit } from '../../src/core/audit.ts';
import type { DecisionAudit } from '../../src/core/audit-types.ts';
import type { DecisionPolicy } from '../../src/core/decision-types.ts';
import { parseAiProposalDraft, parseAiSources, validateAiProposal } from '../../src/ai/tools.ts';
import type { AiDecisionContext, AiSessionResult, AiStep, AiStreamEvent, AiUsage } from '../../src/ai/types.ts';
import { ApiError } from './data.ts';

const MAX_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const MAX_EVENTS = 256;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => new ApiError(502, 'INVALID_AI_RESPONSE', 'The AI response could not be verified. No proposal was added to comparison.');

function text(value: unknown, maximum = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw invalid();
  return value;
}

function stamp(value: unknown): string {
  const result = text(value, 40);
  if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(result) || !Number.isFinite(Date.parse(result))) throw invalid();
  return result;
}

function integer(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) throw invalid();
  return value;
}

function strings(value: unknown, maximum: number, itemMaximum = 500): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw invalid();
  return value.map(item => text(item, itemMaximum));
}

export function parseAiStep(value: unknown): AiStep {
  if (!object(value) || !['status', 'tool', 'research', 'validation', 'warning', 'complete'].includes(String(value.type))) throw invalid();
  const sequence = integer(value.sequence, 120);
  if (sequence === 0) throw invalid();
  return { sequence, at: stamp(value.at), type: value.type as AiStep['type'], message: text(value.message, 1_000),
    ...(value.toolName === undefined ? {} : { toolName: text(value.toolName, 80) }),
    ...(value.proposalId === undefined ? {} : { proposalId: text(value.proposalId, 100) }),
    ...(value.sourceIds === undefined ? {} : { sourceIds: strings(value.sourceIds, 80, 100) }) };
}

function usage(value: unknown): AiUsage {
  if (!object(value)) throw invalid();
  return { inputTokens: integer(value.inputTokens, 10_000_000), outputTokens: integer(value.outputTokens, 8_000),
    modelCalls: integer(value.modelCalls, 6), toolCalls: integer(value.toolCalls, 128),
    webSearchCalls: integer(value.webSearchCalls, 6), webFetchCalls: integer(value.webFetchCalls, 6),
    ...(typeof value.estimatedCostUsd === 'number' && Number.isFinite(value.estimatedCostUsd) && value.estimatedCostUsd >= 0 && value.estimatedCostUsd < 1000
      ? { estimatedCostUsd: value.estimatedCostUsd } : {}),
    ...(typeof value.costBasis === 'string' ? { costBasis: value.costBasis.slice(0, 300) } : {}) };
}

function context(value: unknown, mode: 'demo' | 'live'): AiDecisionContext {
  if (!object(value) || value.schemaVersion !== 'tour-rescue.api-result.v1' || value.mode !== mode
      || value.scenarioId !== 'germany-five-dates-v1' || !object(value.artists) || !Array.isArray(value.artists.comparisons)
      || value.artists.comparisons.length > 3 || !object(value.audit)) throw invalid();
  const artist = (item: unknown) => {
    if (!object(item)) throw invalid();
    const id = text(item.id, 128);
    if (mode === 'live' && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw invalid();
    return { id, ...(item.name === undefined ? {} : { name: text(item.name) }) };
  };
  const artists = { target: artist(value.artists.target), comparisons: value.artists.comparisons.map(artist), control: artist(value.artists.control) };
  const identities = [artists.target.id, ...artists.comparisons.map(row => row.id), artists.control.id];
  if (new Set(identities.map(id => id.toUpperCase())).size !== identities.length) throw invalid();
  const audit = replayDecisionAudit(value.audit as unknown as DecisionAudit);
  if (audit.mode !== mode || audit.scenarioId !== value.scenarioId) throw invalid();
  if (audit.replay.fitInput.status === 'known') {
    const profiles = audit.replay.fitInput.value.profiles;
    const target = profiles.find(profile => profile.role === 'target');
    const comparisons = profiles.filter(profile => profile.role === 'comparison').map(profile => profile.artistId.toUpperCase());
    if (target?.artistId.toUpperCase() !== artists.target.id.toUpperCase() || comparisons.length !== artists.comparisons.length
        || comparisons.some(id => !artists.comparisons.some(artist => artist.id.toUpperCase() === id))) throw invalid();
  }
  if (audit.controlRun.status === 'known' && audit.controlRun.value.targetArtistId.toUpperCase() !== artists.control.id.toUpperCase()) throw invalid();
  return { schemaVersion: 'tour-rescue.api-result.v1', mode, scenarioId: value.scenarioId, artists, audit };
}

/** Recompute all checks from the returned drafts and replay; wire PASS labels have no authority. */
export function parseAiSession(value: unknown, mode: 'demo' | 'live', expected?: AiDecisionContext): AiSessionResult {
  try {
    if (!object(value) || value.schemaVersion !== 'tour-rescue.ai-session.v1' || value.mode !== mode
        || value.model !== (mode === 'live' ? 'claude-sonnet-5-5' : 'synthetic-transcript')
        || !Array.isArray(value.steps) || value.steps.length > 120
        || !Array.isArray(value.proposals) || value.proposals.length > 4
        || !['completed', 'step-limit', 'token-limit', 'tool-limit', 'cancelled', 'provider-error', 'incomplete'].includes(String(value.stopReason))) throw invalid();
    const sessionId = text(value.sessionId, 128);
    const startedAt = stamp(value.startedAt);
    const completedAt = stamp(value.completedAt);
    if (Date.parse(completedAt) < Date.parse(startedAt)) throw invalid();
    const baseResult = context(value.baseResult, mode);
    if (value.scenarioId !== baseResult.scenarioId) throw invalid();
    if (expected !== undefined) {
      const actualIds = [baseResult.artists.target.id, ...baseResult.artists.comparisons.map(row => row.id), baseResult.artists.control.id];
      const expectedIds = [expected.artists.target.id, ...expected.artists.comparisons.map(row => row.id), expected.artists.control.id];
      if (expected.mode !== mode || JSON.stringify(actualIds.map(id => id.toUpperCase())) !== JSON.stringify(expectedIds.map(id => id.toUpperCase()))
          || JSON.stringify(baseResult.audit.replay.scenario.tour.shows) !== JSON.stringify(expected.audit.replay.scenario.tour.shows)
          || JSON.stringify(baseResult.audit.replay.scenario.roadMatrix) !== JSON.stringify(expected.audit.replay.scenario.roadMatrix)
          || JSON.stringify(baseResult.audit.replay.candidateSet) !== JSON.stringify(expected.audit.replay.candidateSet)
          || JSON.stringify(baseResult.audit.replay.fitInput) !== JSON.stringify(expected.audit.replay.fitInput)
          || JSON.stringify(baseResult.audit.replay.controlFitInput) !== JSON.stringify(expected.audit.replay.controlFitInput)
          || JSON.stringify(baseResult.audit.replay.policy) !== JSON.stringify(expected.audit.replay.policy)
          || JSON.stringify(baseResult.audit.replay.scenario.tour.constraints.additionalBudget) !== JSON.stringify(expected.audit.replay.scenario.tour.constraints.additionalBudget)) throw invalid();
    }
    if (!Array.isArray(value.sources) || value.sources.length > 32) throw invalid();
    const sources = parseAiSources(value.sources);
    if (mode === 'live' && sources.some(row => row.kind === 'synthetic' || row.provenance !== 'provider-tool')) throw invalid();
    const sourceIds = new Set(sources.map(row => row.id));
    const steps = value.steps.map(parseAiStep);
    if (steps.some((step, index) => step.sequence !== index + 1 || (step.sourceIds ?? []).some(id => !sourceIds.has(id)))) throw invalid();
    const seen = new Set<string>();
    const proposals = value.proposals.map(item => {
      if (!object(item)) throw invalid();
      const draft = parseAiProposalDraft(item.draft);
      if (seen.has(draft.id)) throw invalid();
      seen.add(draft.id);
      const preserveDemo = mode === 'demo' && draft.venueName.startsWith('Fictional ')
        && baseResult.audit.replay.scenario.venues.some(venue => venue.id === `venue-${draft.cityId}`
          && venue.cityId === draft.cityId && venue.name === draft.venueName)
        && sources.filter(source => draft.sourceIds.includes(source.id)).every(source => source.provenance === 'synthetic');
      return validateAiProposal(baseResult.audit, draft, sources, {
        generatedAt: completedAt, runId: `${sessionId}:browser:${draft.id}`,
        ...(preserveDemo ? { preserveSyntheticBookingFacts: true } : {}),
      });
    });
    if (value.stopReason === 'completed' && proposals.length < 2) throw invalid();
    return { schemaVersion: 'tour-rescue.ai-session.v1', sessionId, mode, scenarioId: baseResult.scenarioId,
      model: mode === 'live' ? 'claude-sonnet-5-5' : 'synthetic-transcript', startedAt, completedAt,
      baseResult: expected === undefined ? baseResult : { ...baseResult, artists: expected.artists }, steps, sources, proposals, usage: usage(value.usage),
      stopReason: value.stopReason as AiSessionResult['stopReason'], warnings: strings(value.warnings, 24, 1_000) };
  } catch { throw invalid(); }
}

export interface AiLiveRequest {
  readonly baseRunId: string;
  readonly policy?: DecisionPolicy;
  readonly additionalBudgetMinorUnits?: number;
}

export interface AiHealth {
  readonly enabled: boolean;
}

function origin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new TypeError('Use a public Worker origin without credentials, paths, or query parameters.');
  }
  return url.origin;
}

async function errorFromResponse(response: Response): Promise<never> {
  let code = 'AI_UNAVAILABLE';
  let message = 'AI Rescue is unavailable. Your comparison is unchanged.';
  try {
    const body = await smallResponseText(response);
    if (body.length <= 8_192) {
      const parsed: unknown = JSON.parse(body);
      if (object(parsed) && object(parsed.error)) {
        code = text(parsed.error.code, 100);
        message = text(parsed.error.message, 1_000);
      }
    }
  } catch { /* An invalid error body never becomes a successful result. */ }
  const retry = response.headers.get('Retry-After');
  throw new ApiError(response.status, code, message,
    retry !== null && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry)) ? Number(retry) : undefined);
}

/** Error and health endpoints have a separate small ceiling, including chunked bodies. */
async function smallResponseText(response: Response): Promise<string> {
  if (response.body === null) throw invalid();
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let content = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 8_192) throw invalid();
      content += decoder.decode(part.value, { stream: true });
    }
    return content + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}

/** Chunk boundaries are arbitrary: decode incrementally and require exactly one final result plus EOF. */
export async function readAiStream(
  response: Response,
  onEvent: (event: AiStreamEvent) => void,
  expected?: AiDecisionContext,
  signal?: AbortSignal,
): Promise<AiSessionResult> {
  if (!response.ok) return errorFromResponse(response);
  if (!/^application\/x-ndjson(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '') || response.body === null) throw invalid();
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let size = 0;
  let count = 0;
  let sequence = 0;
  let result: AiSessionResult | undefined;
  const observedSteps: AiStep[] = [];
  const cancel = () => { void reader.cancel(); };
  signal?.addEventListener('abort', cancel, { once: true });
  function line(value: string): void {
    if (!value.trim()) return;
    count += 1;
    if (count > MAX_EVENTS || new TextEncoder().encode(value).byteLength > MAX_LINE_BYTES || result !== undefined) throw invalid();
    const item: unknown = JSON.parse(value);
    if (!object(item)) throw invalid();
    if (item.type === 'error') {
      if (!object(item.error)) throw invalid();
      throw new ApiError(502, text(item.error.code, 100), text(item.error.message, 1_000));
    }
    if (item.type === 'step') {
      const step = parseAiStep(item.step);
      if (step.sequence !== sequence + 1) throw invalid();
      sequence = step.sequence;
      observedSteps.push(step);
      onEvent({ type: 'step', step });
      return;
    }
    if (item.type !== 'result') throw invalid();
    result = parseAiSession(item.result, 'live', expected);
    if (observedSteps.length > result.steps.length || observedSteps.some((step, index) => JSON.stringify(step) !== JSON.stringify(result!.steps[index]))) throw invalid();
  }
  try {
    signal?.throwIfAborted();
    for (;;) {
      const chunk = await reader.read();
      signal?.throwIfAborted();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_STREAM_BYTES) throw invalid();
      pending += decoder.decode(chunk.value, { stream: true });
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        line(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
      if (pending.length > MAX_LINE_BYTES) throw invalid();
    }
    pending += decoder.decode();
    if (pending.trim()) line(pending);
    if (result === undefined) throw invalid();
    onEvent({ type: 'result', result });
    return result;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (signal?.aborted) throw signal.reason;
    if (error instanceof ApiError) throw error;
    throw invalid();
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export function createAiClient(workerOrigin: string, request: typeof fetch = fetch) {
  const base = origin(workerOrigin);
  return {
    async health(signal?: AbortSignal): Promise<AiHealth> {
      const response = await request(`${base}/health`, { credentials: 'omit', cache: 'no-store', ...(signal === undefined ? {} : { signal }) });
      if (!response.ok) return errorFromResponse(response);
      const value: unknown = JSON.parse(await smallResponseText(response));
      if (!object(value) || typeof value.aiEnabled !== 'boolean') throw new ApiError(503, 'AI_UNAVAILABLE', 'The deployed Worker does not expose AI Rescue yet.');
      return { enabled: value.aiEnabled };
    },
    async rescue(input: AiLiveRequest, expected: AiDecisionContext, onEvent: (event: AiStreamEvent) => void, signal?: AbortSignal): Promise<AiSessionResult> {
      if (expected.mode !== 'live' || typeof input.baseRunId !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(input.baseRunId)) {
        throw new ApiError(400, 'AI_BASE_REQUIRED', 'Load a live Qloo result before starting AI Rescue.');
      }
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      if (signal?.aborted) abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(new ApiError(504, 'AI_TIMEOUT', 'AI Rescue exceeded its response window. Your comparison is unchanged.')), 125_000);
      try {
        controller.signal.throwIfAborted();
        const response = await request(`${base}/api/ai/live`, { method: 'POST', credentials: 'omit', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal });
        return await readAiStream(response, onEvent, expected, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        if (error instanceof ApiError) throw error;
        throw new ApiError(503, 'AI_NETWORK_ERROR', 'The AI connection was interrupted. Your comparison is unchanged.');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    },
  };
}
