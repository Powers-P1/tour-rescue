import cellGeometry from '../../fixtures/geo/city_cells_de.json' with { type: 'json' };
import { createDecisionAudit } from '../../src/core/audit.ts';
import type { DecisionAudit } from '../../src/core/audit-types.ts';
import type { AffinityProfile, FitInput } from '../../src/core/fit-types.ts';
import { parseDecisionPolicy } from '../../src/core/decision.ts';
import { parseScenarioFitInput } from '../../src/core/scenario-fit.ts';
import { GERMANY_REGION_WKT, GERMANY_SCENARIO_ID, germanyDemoInputs, syntheticQueryEvidence } from '../../src/demo/germany.ts';
import { createQlooClient } from '../../src/qloo/client.ts';
import type { QlooClientOptions, QlooResult } from '../../src/qloo/client.ts';
import { QLOO_ENTITY_ID } from '../../src/qloo/normalize.ts';
import { loadCityCells } from '../../src/qloo/geo.ts';
import type { WorkerEnv } from './config.ts';
import { aiEnabled, liveEnabled } from './config.ts';
import { API_VERSION, HttpError, inputObject, json, problem, readJson } from './http.ts';
import { RateDenied, UsageLedger } from './ledger.ts';
import { handleAiLive, rememberAiBase } from './ai-routes.ts';
import type { runAiSession } from './ai-agent.ts';

interface LiveInput {
  targetArtistId: string;
  comparisonArtistIds: string[];
  controlArtistId: string;
  policy: ReturnType<typeof parseDecisionPolicy>;
  additionalBudgetMinorUnits: number;
}

export interface ApiDecisionResult {
  readonly schemaVersion: 'tour-rescue.api-result.v1';
  readonly mode: 'demo' | 'live';
  readonly scenarioId: string;
  readonly artists: {
    readonly target: { readonly id: string; readonly name?: string };
    readonly comparisons: readonly { readonly id: string; readonly name?: string }[];
    readonly control: { readonly id: string; readonly name?: string };
  };
  readonly audit: DecisionAudit;
}

export interface UnitDependencies {
  readonly env: WorkerEnv;
  readonly ledger: UsageLedger;
  readonly fetch?: QlooClientOptions['fetch'];
  readonly now?: () => number;
  readonly runId?: () => string;
  readonly probeStorage?: () => Promise<void>;
  readonly runAi?: typeof runAiSession;
}

function entity(value: unknown): string {
  if (typeof value !== 'string' || !QLOO_ENTITY_ID.test(value)) {
    throw new HttpError(400, 'INVALID_ARTIST_ID', 'Select a resolved Qloo artist UUID.');
  }
  return value.toUpperCase();
}

function liveInput(value: unknown, defaults: ReturnType<typeof germanyDemoInputs>): LiveInput {
  const data = inputObject(value, ['scenarioId', 'targetArtistId', 'comparisonArtistIds', 'controlArtistId', 'policy', 'additionalBudgetMinorUnits']);
  if (data.scenarioId !== undefined && data.scenarioId !== GERMANY_SCENARIO_ID) {
    throw new HttpError(400, 'UNKNOWN_SCENARIO', 'Only the frozen Germany five-date scenario is supported.');
  }
  const targetArtistId = entity(data.targetArtistId);
  const controlArtistId = entity(data.controlArtistId);
  if (!Array.isArray(data.comparisonArtistIds) || data.comparisonArtistIds.length > 3) {
    throw new HttpError(400, 'INVALID_COMPARISONS', 'Supply an array of zero to three comparison artist IDs.');
  }
  const comparisonArtistIds = data.comparisonArtistIds.map(entity);
  const ids = [targetArtistId, ...comparisonArtistIds, controlArtistId];
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'DUPLICATE_ARTISTS', 'Target, comparison and control artists must be distinct.');
  let policy = defaults.policy;
  if (data.policy !== undefined) {
    inputObject(data.policy, ['schemaVersion', 'minimumFitIndex', 'maxAdditionalDistanceMetres']);
    try { policy = parseDecisionPolicy(data.policy); }
    catch { throw new HttpError(400, 'INVALID_POLICY', 'Supply the versioned integer decision thresholds.'); }
    if (policy.maxAdditionalDistanceMetres > defaults.ranges.maxAdditionalDistanceMetres.maximum) {
      throw new HttpError(400, 'POLICY_OUT_OF_RANGE', 'The extra-distance cap must be within the documented 0 to 500000 metre range.');
    }
  }
  const budget = data.additionalBudgetMinorUnits === undefined ? 100_000 : data.additionalBudgetMinorUnits;
  if (typeof budget !== 'number' || !Number.isSafeInteger(budget) || budget < 0
      || budget > defaults.ranges.additionalBudgetMinorUnits.maximum) {
    throw new HttpError(400, 'INVALID_BUDGET', 'The EUR venue-fee ceiling must be an integer from 0 to 150000 minor units.');
  }
  return { targetArtistId, comparisonArtistIds, controlArtistId, policy, additionalBudgetMinorUnits: budget };
}

function searchInput(value: unknown): string {
  const data = inputObject(value, ['query']);
  if (typeof data.query !== 'string' || data.query.trim().length < 2 || data.query.length > 120
      || /[\u0000-\u001f\u007f]/.test(data.query)) {
    throw new HttpError(400, 'INVALID_SEARCH', 'Artist search requires 2 to 120 printable characters.');
  }
  return data.query.trim();
}

function failedStatus(code: string): number {
  return /RATE_LIMIT|MONTHLY_LIMIT|DAILY_LIMIT/.test(code) ? 429 : 502;
}

/** Heavy pure calculations run in the DO's CPU budget, not the outer free Worker. */
export function createUnitHandler(deps: UnitDependencies): (request: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;
  const runId = deps.runId ?? (() => crypto.randomUUID());
  let inputs: ReturnType<typeof germanyDemoInputs> | undefined;
  let demo: ApiDecisionResult | undefined;
  const baseInputs = () => inputs ??= germanyDemoInputs();

  function demoResult(): ApiDecisionResult {
    if (demo !== undefined) return demo;
    const input = baseInputs();
    const generatedAt = new Date(now()).toISOString();
    const audit = createDecisionAudit({ ...input, candidateSet: input.fitInput.candidateSet,
      mode: 'demo', runId: runId(), generatedAt,
      queries: syntheticQueryEvidence([input.fitInput, input.controlFitInput], generatedAt) });
    demo = { schemaVersion: 'tour-rescue.api-result.v1', mode: 'demo', scenarioId: input.scenario.id,
      artists: input.artists, audit };
    return demo;
  }

  function qloo() {
    return createQlooClient({
      apiKey: deps.env.QLOO_API_KEY!, now, ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      mapping: loadCityCells(cellGeometry), candidateSet: baseInputs().fitInput.candidateSet,
      regionWkt: GERMANY_REGION_WKT,
      cache: { get: key => deps.ledger.cacheGet(key), put: (key, value) => deps.ledger.cachePut(key, value) },
      beforeRequest: () => deps.ledger.acquireQlooRequest(),
    });
  }

  return async request => {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/health' && request.method === 'GET') {
        await deps.probeStorage?.();
        return json({ ok: true, version: API_VERSION, storage: 'available' });
      }
      if ((path === '/demo' || path === '/demo/audit') && request.method === 'GET') {
        const result = demoResult();
        return path === '/demo' ? json(result) : json(result.audit, 200,
          { 'Content-Disposition': 'attachment; filename="tour-rescue-demo-audit.json"' });
      }
      if (path === '/ai/live' && request.method === 'POST') {
        return await handleAiLive(request, { env: deps.env, ledger: deps.ledger, now, runId,
          ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
          ...(deps.runAi === undefined ? {} : { runAi: deps.runAi }),
        });
      }
      if ((path !== '/live' && path !== '/search') || request.method !== 'POST') {
        return problem(404, 'NOT_FOUND', 'No such internal operation.');
      }
      if (!liveEnabled(deps.env)) return problem(503, 'LIVE_DISABLED', 'Live mode is disabled; use the labelled demo.');
      const clientHash = request.headers.get('X-Tour-Client');
      if (clientHash === null || !/^[a-f0-9]{64}$/.test(clientHash)) {
        return problem(400, 'CLIENT_ID_UNAVAILABLE', 'A server-derived client identity is required.');
      }
      const body = await readJson(request);
      if (path === '/search') {
        const query = searchInput(body);
        await deps.ledger.reserveSession(clientHash);
        const result = await qloo().searchArtists({ queryId: `${runId()}:search`, query });
        if (result.status === 'success' && aiEnabled(deps.env)) {
          for (const artist of result.value) await deps.ledger.cachePut(`ai-artist-name:${artist.id}`, artist.name);
        }
        return result.status === 'success'
          ? json({ mode: 'live', artists: result.value, queries: [result.evidence] })
          : json({ mode: 'live', error: result.error, queries: [result.evidence] }, failedStatus(result.error.code),
            result.error.retryAfterSeconds === undefined ? undefined : { 'Retry-After': String(result.error.retryAfterSeconds) });
      }
      const defaults = baseInputs();
      const input = liveInput(body, defaults);
      await deps.ledger.reserveSession(clientHash);
      const client = qloo();
      const id = runId();
      const targetWeight = input.comparisonArtistIds.length === 0 ? 1 : 0.5;
      const selected = [
        { artistId: input.targetArtistId, role: 'target' as const, weight: targetWeight },
        ...input.comparisonArtistIds.map(artistId => ({ artistId, role: 'comparison' as const,
          weight: 0.5 / input.comparisonArtistIds.length })),
        { artistId: input.controlArtistId, role: 'target' as const, weight: targetWeight },
      ];
      const results: QlooResult<AffinityProfile>[] = [];
      // At most two large response bodies at once; every miss is reserved before fetch.
      for (let index = 0; index < selected.length; index += 2) {
        const group = selected.slice(index, index + 2);
        results.push(...await Promise.all(group.map((artist, offset) =>
          client.heatmap({ ...artist, queryId: `${id}:artist:${index + offset}` }))));
      }
      const baselineResults = results.slice(0, -1);
      const controlResult = results[results.length - 1]!;
      let fitInput: FitInput | undefined;
      let controlFitInput: FitInput | undefined;
      if (baselineResults.every(result => result.status === 'success')) {
        fitInput = parseScenarioFitInput({ schemaVersion: 'tour-rescue.fit-input.v1',
          candidateSet: defaults.fitInput.candidateSet,
          profiles: baselineResults.map(result => {
            if (result.status !== 'success') throw new Error('Unresolved baseline acquisition.');
            return result.value;
          }) });
        if (controlResult.status === 'success') controlFitInput = parseScenarioFitInput({ ...fitInput,
          profiles: fitInput.profiles.map(profile => profile.role === 'target' ? controlResult.value : profile) });
      }
      const scenario = { ...defaults.scenario, tour: { ...defaults.scenario.tour,
        constraints: { ...defaults.scenario.tour.constraints,
          additionalBudget: { status: 'known' as const, value: { currency: 'EUR', minorUnits: input.additionalBudgetMinorUnits } } } } };
      const queries = results.map(result => result.evidence);
      const generatedAt = new Date(Math.max(now(), ...queries.map(query => Date.parse(query.completedAt)))).toISOString();
      const audit = createDecisionAudit({
        scenario, policy: input.policy, ranges: defaults.ranges, candidateSet: defaults.fitInput.candidateSet,
        ...(fitInput === undefined ? {} : { fitInput }),
        ...(controlFitInput === undefined ? { controlUnavailableReason: fitInput === undefined
          ? 'A required baseline artist query failed; no comparable control decision can be established.'
          : 'The control artist query failed; no control fit was fabricated.' } : { controlFitInput }),
        queries, generatedAt, runId: id, mode: 'live',
      });
      const result: ApiDecisionResult = {
        schemaVersion: 'tour-rescue.api-result.v1', mode: 'live', scenarioId: scenario.id,
        artists: { target: { id: input.targetArtistId }, comparisons: input.comparisonArtistIds.map(id => ({ id })),
          control: { id: input.controlArtistId } }, audit,
      };
      if (aiEnabled(deps.env)) await rememberAiBase(deps.ledger, clientHash, result);
      return json(result);
    } catch (error) {
      if (error instanceof HttpError) return problem(error.status, error.code, error.message);
      if (error instanceof RateDenied) return problem(429, error.code, error.message, error.retryAfterSeconds);
      return problem(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable; no successful decision is asserted.');
    }
  };
}
