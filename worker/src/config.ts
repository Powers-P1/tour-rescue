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
  readonly LIVE_DAILY_CAP?: string;
  readonly LIVE_IP_CAP?: string;
  /** Deprecated aliases for the two caps above. */
  readonly DAILY_LIVE_LIMIT?: string;
  readonly DAILY_PER_IP_LIMIT?: string;
  readonly QLOO_MONTHLY_LIMIT?: string;
}

export const DEFAULT_LIVE_DAILY_CAP = 150;
export const DEFAULT_LIVE_IP_CAP = 25;
export const MAX_LIVE_DAILY_CAP = 1000;
export const MAX_LIVE_IP_CAP = 100;

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > maximum) throw new RangeError('Invalid configured quota.');
  return Number(value);
}

export function ledgerOptions(env: WorkerEnv, now: () => number): LedgerOptions {
  return {
    now, requestsPerSecond: 10,
    monthlyQlooRequests: positiveInteger(env.QLOO_MONTHLY_LIMIT, 50_000, 50_000),
    dailyLiveRequests: positiveInteger(env.LIVE_DAILY_CAP ?? env.DAILY_LIVE_LIMIT, DEFAULT_LIVE_DAILY_CAP, MAX_LIVE_DAILY_CAP),
    dailyPerClientRequests: positiveInteger(env.LIVE_IP_CAP ?? env.DAILY_PER_IP_LIMIT, DEFAULT_LIVE_IP_CAP, MAX_LIVE_IP_CAP),
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

/** Public, non-secret view of the effective limits for /health. Invalid values fall back to "invalid". */
export function caps(env: WorkerEnv) {
  try {
    const o = ledgerOptions(env, Date.now);
    return { liveDaily: o.dailyLiveRequests, perClientDaily: o.dailyPerClientRequests, qlooMonthly: o.monthlyQlooRequests, qlooPerSecond: o.requestsPerSecond };
  } catch { return 'invalid'; }
}
