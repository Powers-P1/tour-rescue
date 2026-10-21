import type { LedgerOptions } from './ledger.ts';
import { DEFAULT_ORIGIN } from './http.ts';

/** Minimal HTTP binding surface; no platform globals or Node runtime dependencies. */
export interface LedgerNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface WorkerEnv {
  readonly UNIT_LEDGER: LedgerNamespace;
  readonly QLOO_API_KEY?: string;
  readonly LIVE_ENABLED?: string;
  readonly ALLOWED_ORIGIN?: string;
  readonly DAILY_LIVE_LIMIT?: string;
  readonly DAILY_PER_IP_LIMIT?: string;
  readonly QLOO_MONTHLY_LIMIT?: string;
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > maximum) throw new RangeError('Invalid configured quota.');
  return Number(value);
}

export function ledgerOptions(env: WorkerEnv, now: () => number): LedgerOptions {
  return {
    now, requestsPerSecond: 10,
    monthlyQlooRequests: positiveInteger(env.QLOO_MONTHLY_LIMIT, 50_000, 50_000),
    dailyLiveRequests: positiveInteger(env.DAILY_LIVE_LIMIT, 30, 30),
    dailyPerClientRequests: positiveInteger(env.DAILY_PER_IP_LIMIT, 10, 10),
    cacheTtlMs: 6 * 60 * 60 * 1000, cacheMaxEntries: 128, cacheMaxEntryBytes: 512 * 1024,
  };
}

export function liveEnabled(env: WorkerEnv): boolean {
  return env.LIVE_ENABLED === 'true' && typeof env.QLOO_API_KEY === 'string' && env.QLOO_API_KEY.trim().length > 0;
}

export function allowedOrigin(env: WorkerEnv): string {
  const value = env.ALLOWED_ORIGIN ?? DEFAULT_ORIGIN;
  const url = new URL(value);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.origin !== value || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new RangeError('ALLOWED_ORIGIN must be one HTTPS origin, or localhost for local development.');
  }
  return value;
}
