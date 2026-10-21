import type { Knowledge } from '../core/domain.ts';
import type { EvidenceWarning, QueryEvidence } from '../core/evidence-types.ts';
import type { AffinityProfile, CandidateSet } from '../core/fit-types.ts';
import type { CityCells } from './geo.ts';
import { NORMALIZATION_VERSION, QLOO_ENTITY_ID, QlooContractError, normalizeHeatmapCells,
  parseArtistSearchResponse, parseHeatmapResponse } from './normalize.ts';
import type { ArtistMatch, ParsedQloo } from './normalize.ts';

export const QLOO_ORIGIN = 'https://hackathon.api.qloo.com';
const CACHE_VERSION = 'tour-rescue.qloo-cache.v1';
const MAX_BYTES = 1_000_000;
const MAX_CELLS = 5000;
const MAX_RETRY_SECONDS = 31 * 24 * 60 * 60;
const known = <T>(value: T): Knowledge<T> => ({ status: 'known', value });
const unknown = (reason: string): Knowledge<never> => ({ status: 'unknown', reason });

export interface QlooCache {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, value: unknown): Promise<void>;
}
export interface QlooClientOptions {
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly cache: QlooCache;
  /** Reserves one request in the durable 10/s and 50k/month ledger; cache hits do not call it. */
  readonly beforeRequest: () => Promise<void>;
  readonly mapping: CityCells;
  readonly candidateSet: CandidateSet;
  readonly regionWkt: string;
  readonly cacheTtlMs?: number;
  readonly maxResponseBytes?: number;
  readonly timeoutMs?: number;
}
export type QlooErrorCode = 'QLOO_RATE_LIMIT' | 'QLOO_MONTHLY_LIMIT' | 'QLOO_QUOTA_UNAVAILABLE'
  | 'QLOO_TIMEOUT' | 'QLOO_NETWORK_ERROR' | 'QLOO_HTTP_ERROR' | 'QLOO_AUTH'
  | 'QLOO_RESPONSE_TOO_LARGE' | 'QLOO_CONTRACT_ERROR' | 'QLOO_NO_RESULTS';
export interface QlooFailure { readonly code: QlooErrorCode; readonly message: string; readonly retryAfterSeconds?: number }
export type QlooResult<T> = { readonly status: 'success'; readonly value: T; readonly evidence: QueryEvidence }
  | { readonly status: 'error'; readonly error: QlooFailure; readonly evidence: QueryEvidence };
export interface SearchArtistsInput { readonly queryId: string; readonly query: string }
export interface HeatmapInput {
  readonly queryId: string; readonly artistId: string; readonly role: AffinityProfile['role']; readonly weight: number;
}

interface CacheEntry<T> {
  readonly schemaVersion: typeof CACHE_VERSION;
  readonly key: string;
  readonly recordedAt: string;
  readonly expiresAt: number;
  readonly responseReference: string;
  readonly data: T;
  readonly upstreamWarningCount: number;
}
class SafeFailure extends Error {
  readonly failure: QlooFailure;
  constructor(code: QlooErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.failure = retryAfterSeconds === undefined ? { code, message } : { code, message, retryAfterSeconds };
  }
}

function intOption(value: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new RangeError(`Invalid ${name}.`);
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validId(value: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
function safeInput(text: string, key: string): boolean { return typeof text === 'string' && !text.includes(key); }
function reflectsSecret(value: unknown, key: string): boolean {
  if (typeof value === 'string') return value.includes(key);
  if (Array.isArray(value)) return value.some(item => reflectsSecret(item, key));
  return isRecord(value) && Object.values(value).some(item => reflectsSecret(item, key));
}

/** This MVP accepts one bounded rectangular POLYGON supplied by the server configuration. */
function validateRegion(wkt: string): string {
  const match = /^POLYGON\s*\(\(\s*([^()]+)\s*\)\)$/u.exec(wkt);
  if (!match || wkt.length > 300) throw new RangeError('A bounded rectangular POLYGON is required.');
  const points = match[1]!.split(',').map(pair => pair.trim().split(/\s+/u).map(Number));
  if (points.length !== 5 || points.some(p => p.length !== 2 || p.some(n => !Number.isFinite(n))
      || Math.abs(p[0]!) > 180 || Math.abs(p[1]!) > 90)) throw new RangeError('Invalid region coordinates.');
  const xs = [...new Set(points.map(p => p[0]!))].sort((a, b) => a - b);
  const ys = [...new Set(points.map(p => p[1]!))].sort((a, b) => a - b);
  if (xs.length !== 2 || ys.length !== 2 || xs[1]! - xs[0]! > 15 || ys[1]! - ys[0]! > 15
      || points[0]![0] !== points[4]![0] || points[0]![1] !== points[4]![1]
      || new Set(points.slice(0, 4).map(p => p.join(','))).size !== 4
      || points.slice(0, 4).some((p, i) => p[0] !== points[i + 1]![0] && p[1] !== points[i + 1]![1])) {
    throw new RangeError('Region must be a closed bounded rectangle.');
  }
  return `POLYGON((${points.map(p => p.join(' ')).join(',')}))`;
}
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}

async function readBody(response: Response, maximum: number, signal: AbortSignal): Promise<string> {
  const length = response.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > maximum) {
    void response.body?.cancel().catch(() => {});
    throw new SafeFailure('QLOO_RESPONSE_TOO_LARGE', 'Qloo response exceeded the configured byte limit.');
  }
  if (response.body === null) throw new QlooContractError();
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      if (signal.aborted) throw new SafeFailure('QLOO_TIMEOUT', 'Qloo request timed out.');
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) {
        cancel();
        throw new SafeFailure('QLOO_RESPONSE_TOO_LARGE', 'Qloo response exceeded the configured byte limit.');
      }
      chunks.push(chunk.value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new QlooContractError(); }
}

function parseCache<T>(value: unknown, key: string, now: number, ttl: number,
  validateData: (data: unknown) => T): CacheEntry<T> | undefined {
  if (!isRecord(value) || value.schemaVersion !== CACHE_VERSION || value.key !== key
      || typeof value.recordedAt !== 'string' || !Number.isFinite(Date.parse(value.recordedAt))
      || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt)
      || value.expiresAt <= now || Date.parse(value.recordedAt) > now
      || value.expiresAt - Date.parse(value.recordedAt) > ttl
      || typeof value.responseReference !== 'string' || !/^qloo-response:sha256:[a-f0-9]{64}$/.test(value.responseReference)
      || typeof value.upstreamWarningCount !== 'number' || !Number.isSafeInteger(value.upstreamWarningCount)
      || value.upstreamWarningCount < 0 || value.upstreamWarningCount > 1000) return undefined;
  try { return { schemaVersion: CACHE_VERSION, key, recordedAt: value.recordedAt, expiresAt: value.expiresAt,
    responseReference: value.responseReference, data: validateData(value.data), upstreamWarningCount: value.upstreamWarningCount }; }
  catch { return undefined; }
}

/** Server-only client. No raw response, headers, API key or arbitrary upstream error text leaves this boundary. */
export function createQlooClient(options: QlooClientOptions) {
  const apiKey = options.apiKey;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0 || /[\s\u0000-\u001f\u007f]/u.test(apiKey)) {
    throw new RangeError('A server-side Qloo API key is required.');
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const ttl = intOption(options.cacheTtlMs ?? 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000, 'cache TTL');
  const maximum = intOption(options.maxResponseBytes ?? MAX_BYTES, MAX_BYTES, 'response byte limit');
  const timeout = intOption(options.timeoutMs ?? 10000, 15000, 'request timeout');
  const region = validateRegion(options.regionWkt);
  const candidateSet: CandidateSet = { id: options.candidateSet.id, cityIds: [...options.candidateSet.cityIds] };
  const mapping: CityCells = { precision: options.mapping.precision, cityIds: [...options.mapping.cityIds],
    citiesWithoutCells: new Set(options.mapping.citiesWithoutCells), index: new Map(options.mapping.index) };
  if (!validId(candidateSet.id) || candidateSet.cityIds.length < 2 || candidateSet.cityIds.length > 100
      || new Set(candidateSet.cityIds).size !== candidateSet.cityIds.length
      || candidateSet.cityIds.some(id => !validId(id) || !mapping.cityIds.includes(id))) throw new RangeError('Invalid frozen city set.');

  async function request<T>(queryId: string, operation: QueryEvidence['operation'], parameters: Record<string, string>,
    parse: (value: unknown) => ParsedQloo<T>, validateCached: (value: unknown) => T): Promise<QlooResult<T>> {
    if (!validId(queryId) || !safeInput(queryId, apiKey)) throw new RangeError('Invalid query ID.');
    const endpoint = operation === 'artist-search' ? '/search' : '/v2/insights';
    const startedAt = new Date(now()).toISOString();
    const warnings: EvidenceWarning[] = [];
    let source: QueryEvidence['source'] = 'live';
    let httpStatus: Knowledge<number> = unknown('No HTTP response was received.');
    let responseReference: Knowledge<string> = unknown('No successful response was recorded.');
    let responseRecordedAt: Knowledge<string> = unknown('No successful response was recorded.');
    const evidence = (status: QueryEvidence['status']): QueryEvidence => ({ queryId, operation, endpoint,
      parameters, startedAt, completedAt: new Date(now()).toISOString(), source, status,
      httpStatus, responseReference, responseRecordedAt, warnings });
    const params = new URLSearchParams(parameters);
    params.sort();
    const requestIdentity = `${QLOO_ORIGIN}${endpoint}?${params}`;
    const key = `qloo:v1:${await sha256(requestIdentity)}`;
    const providerWarnings = (count: number) => {
      if (count > 0) warnings.push({ code: 'QLOO_UPSTREAM_WARNING', queryId,
        message: `Qloo returned ${count} warning(s); unrestricted provider text is excluded from the public audit.` });
    };
    try {
      const cachedValue = await options.cache.get(key);
      const cached = parseCache(cachedValue, key, now(), ttl, validateCached);
      if (cached !== undefined && !reflectsSecret(cached.data, apiKey)) {
        source = 'cache'; httpStatus = known(200); responseReference = known(cached.responseReference);
        responseRecordedAt = known(cached.recordedAt); providerWarnings(cached.upstreamWarningCount);
        return { status: 'success', value: cached.data, evidence: evidence('success') };
      }
      if (cachedValue !== undefined) warnings.push({ code: 'QLOO_CACHE_MISS', queryId,
        message: 'Cached evidence was expired or invalid; a fresh bounded request is required.' });
    } catch {
      warnings.push({ code: 'QLOO_CACHE_READ_FAILED', queryId, message: 'Private cache was unavailable; a fresh request is required.' });
    }
    try {
      try { await options.beforeRequest(); }
      catch (error) {
        if (isRecord(error) && (error.code === 'QLOO_RATE_LIMIT' || error.code === 'QLOO_MONTHLY_LIMIT')) {
          const retry = typeof error.retryAfterSeconds === 'number' && Number.isSafeInteger(error.retryAfterSeconds)
            && error.retryAfterSeconds > 0 ? Math.min(error.retryAfterSeconds, MAX_RETRY_SECONDS) : undefined;
          throw new SafeFailure(error.code, 'The Qloo request allowance is exhausted.', retry);
        }
        throw new SafeFailure('QLOO_QUOTA_UNAVAILABLE', 'The Qloo request allowance could not be verified.');
      }
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new SafeFailure('QLOO_TIMEOUT', 'Qloo request timed out.')); }, timeout);
      });
      let body: string;
      try {
        body = await Promise.race([deadline, (async () => {
          const response = await fetcher(requestIdentity, { method: 'GET', headers: { Accept: 'application/json', 'X-Api-Key': apiKey },
            redirect: 'manual', signal: controller.signal });
          httpStatus = known(response.status);
          if (!response.ok) {
            void response.body?.cancel().catch(() => {});
            const retry = response.headers.get('retry-after');
            const retrySeconds = retry !== null && /^\d+$/.test(retry) && Number(retry) > 0
              ? Math.min(Number(retry), MAX_RETRY_SECONDS) : undefined;
            if (response.status === 429) throw new SafeFailure('QLOO_RATE_LIMIT', 'Qloo rejected the request because its rate limit was reached.', retrySeconds);
            if (response.status === 401 || response.status === 403) throw new SafeFailure('QLOO_AUTH', 'Qloo authentication failed.');
            if (response.status === 404 && operation === 'artist-search') throw new SafeFailure('QLOO_NO_RESULTS', 'Qloo found no artist matching this search.');
            throw new SafeFailure('QLOO_HTTP_ERROR', 'Qloo returned an unsuccessful HTTP status.');
          }
          const type = response.headers.get('content-type');
          if (type === null || !/^application\/json(?:\s*;|$)/i.test(type)) {
            void response.body?.cancel().catch(() => {});
            throw new QlooContractError();
          }
          return readBody(response, maximum, controller.signal);
        })()]);
      } finally { if (timer !== undefined) clearTimeout(timer); }
      let json: unknown;
      try { json = JSON.parse(body); } catch { throw new QlooContractError(); }
      const parsed = parse(json);
      // Even a syntactically successful upstream payload may reflect a secret.
      if (reflectsSecret(parsed.value, apiKey)) throw new QlooContractError();
      const recordedAt = new Date(now()).toISOString();
      const reference = `qloo-response:sha256:${await sha256(`${requestIdentity}\n${body}`)}`;
      responseReference = known(reference); responseRecordedAt = known(recordedAt); providerWarnings(parsed.upstreamWarningCount);
      const cached: CacheEntry<T> = { schemaVersion: CACHE_VERSION, key, recordedAt,
        expiresAt: Date.parse(recordedAt) + ttl, responseReference: reference,
        data: parsed.value, upstreamWarningCount: parsed.upstreamWarningCount };
      try { await options.cache.put(key, cached); }
      catch { warnings.push({ code: 'QLOO_CACHE_WRITE_FAILED', queryId, message: 'The response was usable but could not be cached privately.' }); }
      return { status: 'success', value: parsed.value, evidence: evidence('success') };
    } catch (error) {
      const failure = error instanceof SafeFailure ? error.failure : error instanceof QlooContractError
        ? { code: 'QLOO_CONTRACT_ERROR' as const, message: 'Qloo response does not match the verified bounded contract.' }
        : { code: 'QLOO_NETWORK_ERROR' as const, message: 'Qloo request could not be completed.' };
      warnings.push({ code: failure.code, queryId, message: failure.message });
      return { status: 'error', error: failure, evidence: evidence('failed') };
    }
  }

  return {
    async searchArtists(input: SearchArtistsInput): Promise<QlooResult<readonly ArtistMatch[]>> {
      if (!safeInput(input.query, apiKey) || input.query.trim().length < 2 || input.query.length > 120
          || /[\u0000-\u001f\u007f]/u.test(input.query)) throw new RangeError('Artist search must contain 2 to 120 printable characters.');
      return request(input.queryId, 'artist-search', { query: input.query.trim(), types: 'urn:entity:artist', take: '10' },
        parseArtistSearchResponse, data => {
          if (!Array.isArray(data)) throw new QlooContractError();
          return parseArtistSearchResponse({ results: data.map(row => {
            if (!isRecord(row)) throw new QlooContractError();
            return { entity_id: row.id, name: row.name, subtype: 'urn:entity:artist' };
          }) }).value;
        });
    },
    async heatmap(input: HeatmapInput): Promise<QlooResult<AffinityProfile>> {
      if (!QLOO_ENTITY_ID.test(input.artistId) || !safeInput(input.artistId, apiKey)
          || !['target', 'comparison'].includes(input.role) || !Number.isFinite(input.weight)
          || input.weight <= 0 || input.weight > 1) throw new RangeError('Invalid single-artist heatmap request.');
      const result = await request(input.queryId, 'artist-heatmap', {
        'filter.type': 'urn:heatmap', 'filter.location': region,
        'signal.interests.entities': input.artistId.toUpperCase(), 'output.heatmap.boundary': 'urn:geohash',
      }, value => parseHeatmapResponse(value, MAX_CELLS), data => {
        if (!Array.isArray(data)) throw new QlooContractError();
        return parseHeatmapResponse({ success: true, results: { heatmap: data.map(row => {
          if (!isRecord(row)) throw new QlooContractError();
          return { location: { geohash: row.geohash }, query: { affinity: row.affinity, popularity: row.popularity } };
        }) } }, MAX_CELLS).value;
      });
      if (result.status === 'error') return result;
      if (result.evidence.responseReference.status !== 'known' || result.evidence.responseRecordedAt.status !== 'known') throw new Error('Successful Qloo evidence requires provenance.');
      const normalized = normalizeHeatmapCells(result.value, {
        candidateSet, queryId: input.queryId, artistId: input.artistId.toUpperCase(), role: input.role, weight: input.weight,
        provenance: { kind: 'recording-reference', reference: result.evidence.responseReference.value,
          evidenceId: result.evidence.responseReference.value, recordedAt: result.evidence.responseRecordedAt.value,
          normalizationVersion: NORMALIZATION_VERSION },
      }, mapping);
      return { status: 'success', value: normalized.profile, evidence: {
        ...result.evidence, warnings: [...result.evidence.warnings, ...normalized.warnings],
      } };
    },
  };
}
