import { createDecisionAudit } from '../../src/core/audit.ts';
import type { DecisionAudit } from '../../src/core/audit-types.ts';
import { parseDecisionPolicy } from '../../src/core/decision.ts';
import type { AiStreamEvent } from '../../src/ai/types.ts';
import type { ApiDecisionResult } from './app.ts';
import { aiEnabled } from './config.ts';
import type { WorkerEnv } from './config.ts';
import { HttpError, inputObject, problem, readJson } from './http.ts';
import type { UsageLedger } from './ledger.ts';
import { runAiSession } from './ai-agent.ts';

const BASE_TTL_MS = 6 * 60 * 60 * 1000;
const baseKey = (runId: string) => `ai-base:${runId}`;

/** Store just reproducible inputs, not the much larger repeated analysis trees. */
interface AiBaseRecord {
  readonly schemaVersion: 'tour-rescue.ai-base.v1';
  readonly clientHash: string;
  readonly runId: string;
  readonly generatedAt: string;
  readonly artists: ApiDecisionResult['artists'];
  readonly replay: DecisionAudit['replay'];
  readonly queries: DecisionAudit['queries'];
}

export async function rememberAiBase(ledger: UsageLedger, clientHash: string, result: ApiDecisionResult): Promise<void> {
  if (result.mode !== 'live') throw new TypeError('AI live context must come from a live Worker result.');
  const named = async (artist: { readonly id: string; readonly name?: string }) => {
    const name = await ledger.cacheGet<unknown>(`ai-artist-name:${artist.id}`);
    return { ...artist, ...(typeof name === 'string' && name.trim().length > 0 && name.length <= 500
      ? { name } : {}) };
  };
  const artists = { target: await named(result.artists.target),
    comparisons: await Promise.all(result.artists.comparisons.map(named)), control: await named(result.artists.control) };
  const record: AiBaseRecord = {
    schemaVersion: 'tour-rescue.ai-base.v1', clientHash, runId: result.audit.runId,
    generatedAt: result.audit.generatedAt, artists,
    replay: result.audit.replay, queries: result.audit.queries,
  };
  await ledger.cachePut(baseKey(record.runId), record, BASE_TTL_MS);
}

interface AiRouteDependencies {
  readonly env: WorkerEnv;
  readonly ledger: UsageLedger;
  readonly now: () => number;
  readonly runId: () => string;
  readonly fetch?: typeof fetch;
  readonly runAi?: typeof runAiSession;
}

/** Client bodies can change declared preferences, never source facts, cities or provider tools. */
async function prepareAiContext(request: Request, deps: AiRouteDependencies, clientHash: string): Promise<() => ApiDecisionResult> {
  const data = inputObject(await readJson(request), ['baseRunId', 'policy', 'additionalBudgetMinorUnits']);
  if (typeof data.baseRunId !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(data.baseRunId)) {
    throw new HttpError(400, 'INVALID_AI_BASE', 'Supply the run ID of your latest live Qloo decision.');
  }
  const record = await deps.ledger.cacheGet<AiBaseRecord>(baseKey(data.baseRunId));
  if (!record || record.schemaVersion !== 'tour-rescue.ai-base.v1' || record.clientHash !== clientHash
      || record.runId !== data.baseRunId) {
    throw new HttpError(409, 'AI_BASE_EXPIRED', 'Refresh the live Qloo decision before researching it with AI. The saved context expired or belongs to another client.');
  }
  const replay = record.replay;
  let policy = replay.policy;
  if (data.policy !== undefined) {
    inputObject(data.policy, ['schemaVersion', 'minimumFitIndex', 'maxAdditionalDistanceMetres']);
    try { policy = parseDecisionPolicy(data.policy); }
    catch { throw new HttpError(400, 'INVALID_POLICY', 'Supply the versioned integer decision thresholds.'); }
    if (policy.maxAdditionalDistanceMetres > replay.ranges.maxAdditionalDistanceMetres.maximum) {
      throw new HttpError(400, 'POLICY_OUT_OF_RANGE', 'The extra-distance cap must be within 0 to 500000 metres.');
    }
  }
  let scenario = replay.scenario;
  if (data.additionalBudgetMinorUnits !== undefined) {
    const amount = data.additionalBudgetMinorUnits;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0
        || amount > replay.ranges.additionalBudgetMinorUnits.maximum) {
      throw new HttpError(400, 'INVALID_BUDGET', 'The venue-fee ceiling must be an integer from 0 to 150000 EUR minor units.');
    }
    scenario = { ...scenario, tour: { ...scenario.tour, constraints: { ...scenario.tour.constraints,
      additionalBudget: { status: 'known', value: { currency: 'EUR', minorUnits: amount } },
    } } };
  }
  return () => {
    const audit = createDecisionAudit({
      scenario, policy, ranges: replay.ranges, queries: record.queries, mode: 'live', runId: record.runId,
      generatedAt: new Date(Math.max(deps.now(), Date.parse(record.generatedAt))).toISOString(),
      ...(replay.candidateSet.status === 'known' ? { candidateSet: replay.candidateSet.value } : {}),
      ...(replay.fitInput.status === 'known' ? { fitInput: replay.fitInput.value } : {}),
      ...(replay.controlFitInput.status === 'known' ? { controlFitInput: replay.controlFitInput.value } : {}),
    });
    return { schemaVersion: 'tour-rescue.api-result.v1', mode: 'live', scenarioId: scenario.id,
      artists: record.artists, audit };
  };
}

export async function handleAiLive(request: Request, deps: AiRouteDependencies): Promise<Response> {
  if (!aiEnabled(deps.env)) return problem(503, 'AI_DISABLED', 'AI Rescue live mode is disabled; saved demo transcripts remain available.');
  const clientHash = request.headers.get('X-Tour-Client');
  if (clientHash === null || !/^[a-f0-9]{64}$/.test(clientHash)) {
    return problem(400, 'CLIENT_ID_UNAVAILABLE', 'A server-derived client identity is required.');
  }
  const buildContext = await prepareAiContext(request, deps, clientHash);
  if (request.signal.aborted) return problem(499, 'AI_CANCELLED', 'The AI session was cancelled before it started.');
  // This must settle durably before the stream or any paid provider request starts.
  await deps.ledger.reserveAiSession(clientHash);
  // The disconnect can arrive while the transaction awaits storage. Keep the reservation,
  // but do not miss that abort by subscribing only after it has already happened.
  if (request.signal.aborted) return problem(499, 'AI_CANCELLED', 'The AI session was cancelled before the provider started.');
  // Denied sessions must not repeatedly consume the deterministic engine's CPU budget.
  const baseResult = buildContext();
  const cancellation = new AbortController();
  const onAbort = () => cancellation.abort();
  request.signal.addEventListener('abort', onAbort, { once: true });
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AiStreamEvent): void => {
        if (closed || cancellation.signal.aborted) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const result = await (deps.runAi ?? runAiSession)({
          baseResult, sessionId: deps.runId(), apiKey: deps.env.ANTHROPIC_API_KEY!, now: deps.now,
          signal: cancellation.signal, onEvent: emit,
          ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
        });
        emit({ type: 'result', result });
      } catch {
        emit({ type: 'error', error: { code: 'AI_SERVICE_UNAVAILABLE',
          message: 'The AI session could not be completed. No new option was accepted.' } });
      } finally {
        request.signal.removeEventListener('abort', onAbort);
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; cancellation.abort(); request.signal.removeEventListener('abort', onAbort); },
  });
  return new Response(stream, { headers: {
    'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform',
    'X-Content-Type-Options': 'nosniff',
  } });
}
