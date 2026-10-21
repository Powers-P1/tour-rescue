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
  readonly ANTHROPIC_API_KEY?: string;
  readonly LIVE_ENABLED?: string;
  readonly AI_ENABLED?: string;
  readonly ALLOWED_ORIGIN?: string;
  readonly LIVE_DAILY_CAP?: string;
  readonly LIVE_IP_CAP?: string;
  /** Deprecated aliases for the two caps above. */
  readonly DAILY_LIVE_LIMIT?: string;
  readonly DAILY_PER_IP_LIMIT?: string;
  readonly QLOO_MONTHLY_LIMIT?: string;
  readonly DAILY_AI_LIMIT?: string;
  readonly DAILY_AI_PER_IP_LIMIT?: string;
  /** AI sessions per UTC day (global / per daily client hash). Hard ceilings 200 / 20. */
  readonly AI_DAILY_CAP?: string;
  readonly AI_CLIENT_CAP?: string;
  /** Observed cumulative input-token stop for one AI session (default 150000). */
  readonly AI_MAX_INPUT_TOKENS?: string;
}

export const DEFAULT_AI_DAILY_CAP = 40;
export const DEFAULT_AI_CLIENT_CAP = 5;
export const MAX_AI_DAILY_CAP = 200;
export const MAX_AI_CLIENT_CAP = 20;
export const DEFAULT_AI_MAX_INPUT_TOKENS = 150_000;
export const MAX_AI_MAX_INPUT_TOKENS = 400_000;

/**
 * Cost estimate constants (USD), from the Anthropic pricing page for claude-sonnet-5-5 checked 2026-10-21:
 * $2 / MTok input, $10 / MTok output, web search $10 / 1,000 searches. Cache reads ($0.10 / MTok) and
 * cache writes are billed at the base input rate here, so the figure is approximate (a slight overestimate).
 */
export const AI_PRICING = {
  inputUsdPerMTok: 2, outputUsdPerMTok: 10, searchUsdPerThousand: 10,
  basis: 'approximate: Sonnet 5.5 list price $2/$10 per MTok, search $10/1000; all input tokens billed at base rate; fetch not charged separately',
} as const;

export function estimateAiCostUsd(usage: { inputTokens: number; outputTokens: number; webSearchCalls: number }): number {
  const usd = usage.inputTokens / 1e6 * AI_PRICING.inputUsdPerMTok + usage.outputTokens / 1e6 * AI_PRICING.outputUsdPerMTok
    + usage.webSearchCalls / 1000 * AI_PRICING.searchUsdPerThousand;
  return Math.round(usd * 10_000) / 10_000;
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
    dailyAiSessions: positiveInteger(env.AI_DAILY_CAP ?? env.DAILY_AI_LIMIT, DEFAULT_AI_DAILY_CAP, MAX_AI_DAILY_CAP),
    dailyAiPerClientSessions: positiveInteger(env.AI_CLIENT_CAP ?? env.DAILY_AI_PER_IP_LIMIT, DEFAULT_AI_CLIENT_CAP, MAX_AI_CLIENT_CAP),
    cacheTtlMs: 6 * 60 * 60 * 1000, cacheMaxEntries: 128, cacheMaxEntryBytes: 512 * 1024,
  };
}

export function aiMaxInputTokens(env: WorkerEnv): number {
  return positiveInteger(env.AI_MAX_INPUT_TOKENS, DEFAULT_AI_MAX_INPUT_TOKENS, MAX_AI_MAX_INPUT_TOKENS);
}

export function liveEnabled(env: WorkerEnv): boolean {
  return env.LIVE_ENABLED === 'true' && typeof env.QLOO_API_KEY === 'string' && env.QLOO_API_KEY.trim().length > 0;
}

/** AI researches a server-recorded live fit run; both kill switches must permit it. */
export function aiEnabled(env: WorkerEnv): boolean {
  return liveEnabled(env) && env.AI_ENABLED === 'true'
    && typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim().length > 0;
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
    return { liveDaily: o.dailyLiveRequests, perClientDaily: o.dailyPerClientRequests, qlooMonthly: o.monthlyQlooRequests, qlooPerSecond: o.requestsPerSecond,
      aiDaily: o.dailyAiSessions, aiPerClientDaily: o.dailyAiPerClientSessions };
  } catch { return 'invalid'; }
}
