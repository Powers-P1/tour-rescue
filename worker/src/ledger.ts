/**
 * Private, bounded state for the single UnitLedger Durable Object. The adapter
 * supplies ctx.storage; transactions prevent simultaneous requests overspending
 * a quota. Counters describe this service, not other users of the same Qloo key.
 */
export interface LedgerTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface LedgerStorage extends LedgerTransaction {
  transaction<T>(operation: (transaction: LedgerTransaction) => Promise<T>): Promise<T>;
}

export type RateDeniedCode =
  | 'QLOO_RATE_LIMIT'
  | 'QLOO_MONTHLY_LIMIT'
  | 'LIVE_DAILY_LIMIT'
  | 'LIVE_CLIENT_DAILY_LIMIT'
  | 'AI_DAILY_LIMIT'
  | 'AI_CLIENT_DAILY_LIMIT';

const rateMessages: Record<RateDeniedCode, string> = {
  QLOO_RATE_LIMIT: 'The Qloo request rate limit has been reached.',
  QLOO_MONTHLY_LIMIT: 'The Qloo monthly request allowance has been reached.',
  LIVE_DAILY_LIMIT: 'The daily live-mode allowance has been reached.',
  LIVE_CLIENT_DAILY_LIMIT: 'The daily live-mode allowance for this client has been reached.',
  AI_DAILY_LIMIT: 'The daily AI Rescue session allowance has been reached.',
  AI_CLIENT_DAILY_LIMIT: 'The daily AI Rescue session allowance for this client has been reached.',
};

export class RateDenied extends Error {
  readonly code: RateDeniedCode;
  readonly retryAfterSeconds: number;

  constructor(code: RateDeniedCode, retryAfterSeconds: number) {
    super(rateMessages[code]);
    this.name = 'RateDenied';
    this.code = code;
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export interface LedgerOptions {
  readonly now?: () => number;
  readonly requestsPerSecond?: number;
  readonly monthlyQlooRequests?: number;
  readonly dailyLiveRequests?: number;
  readonly dailyPerClientRequests?: number;
  readonly dailyAiSessions?: number;
  readonly dailyAiPerClientSessions?: number;
  readonly cacheTtlMs?: number;
  readonly cacheMaxEntries?: number;
  readonly cacheMaxEntryBytes?: number;
}

interface Limits {
  requestsPerSecond: number;
  monthlyQlooRequests: number;
  dailyLiveRequests: number;
  dailyPerClientRequests: number;
  dailyAiSessions: number;
  dailyAiPerClientSessions: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  cacheMaxEntryBytes: number;
}

interface QuotaState {
  version: 1;
  lastNow: number;
  day: string;
  sessions: number;
  clients: { hash: string; count: number }[];
  month: string;
  qlooRequests: number;
  recentStarts: number[];
}

interface CacheIndex {
  version: 1;
  lastNow: number;
  entries: { key: string; writtenAt: number; expiresAt: number }[];
}

interface CacheEntry {
  version: 1;
  expiresAt: number;
  payload: string;
}

const QUOTA_KEY = 'tour-rescue:quotas:v1';
const AI_QUOTA_KEY = 'tour-rescue:ai-quotas:v1';
const AI_COST_KEY = 'tour-rescue:ai-cost:v1';
const CACHE_INDEX_KEY = 'tour-rescue:cache-index:v1';
const cacheKey = (key: string) => `tour-rescue:cache:v1:${key}`;
const MAX_TIME = 253402300799999; // Last millisecond of year 9999, a supported ISO calendar.
const MAX_TTL = 24 * 60 * 60 * 1000;
const SHA256 = /^[a-f0-9]{64}$/;

const integer = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);
const monthOf = (time: number) => new Date(time).toISOString().slice(0, 7);
const secondsUntilDayEnd = (time: number) => {
  const date = new Date(time);
  return Math.ceil((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - time) / 1000);
};
const secondsUntilMonthEnd = (time: number) => {
  const date = new Date(time);
  return Math.ceil((Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - time) / 1000);
};

function limit(value: number | undefined, fallback: number, maximum: number, name: string): number {
  const selected = value === undefined ? fallback : value;
  if (!integer(selected, maximum) || selected === 0) {
    throw new RangeError(`${name} must be a positive integer no greater than ${maximum}.`);
  }
  return selected;
}

function timeValue(value: number): number {
  if (!integer(value, MAX_TIME)) throw new RangeError('Ledger clock must return a supported nonnegative integer UTC timestamp.');
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function quotaState(value: unknown, now: number): QuotaState {
  if (value === undefined) return {
    version: 1, lastNow: now, day: dayOf(now), sessions: 0, clients: [],
    month: monthOf(now), qlooRequests: 0, recentStarts: [],
  };
  if (!isObject(value) || value.version !== 1 || !integer(value.lastNow, MAX_TIME)
      || value.day !== dayOf(value.lastNow) || value.month !== monthOf(value.lastNow)
      || !integer(value.sessions, 1000) || !integer(value.qlooRequests, 50000)
      || !Array.isArray(value.clients) || value.clients.length > 1000
      || !Array.isArray(value.recentStarts) || value.recentStarts.length > 10) {
    throw new Error('Stored quota state is invalid; live requests are disabled until repaired.');
  }
  const clients: QuotaState['clients'] = [];
  const seen = new Set<string>();
  for (const row of value.clients) {
    if (!isObject(row) || typeof row.hash !== 'string' || !SHA256.test(row.hash)
        || seen.has(row.hash) || !integer(row.count, 100) || row.count === 0) {
      throw new Error('Stored quota state is invalid; live requests are disabled until repaired.');
    }
    clients.push({ hash: row.hash, count: row.count });
    seen.add(row.hash);
  }
  if (clients.reduce((sum, row) => sum + row.count, 0) !== value.sessions) {
    throw new Error('Stored quota state is invalid; live requests are disabled until repaired.');
  }
  const recentStarts: number[] = [];
  for (const stamp of value.recentStarts) {
    if (!integer(stamp, value.lastNow) || (recentStarts.length > 0 && stamp < recentStarts[recentStarts.length - 1]!)) {
      throw new Error('Stored quota state is invalid; live requests are disabled until repaired.');
    }
    recentStarts.push(stamp);
  }
  return {
    version: 1, lastNow: value.lastNow, day: value.day as string, sessions: value.sessions, clients,
    month: value.month as string, qlooRequests: value.qlooRequests, recentStarts,
  };
}

function advanceQuota(state: QuotaState, observedNow: number): number {
  // A backwards clock must never reopen a prior day's/month's allowance.
  const now = Math.max(state.lastNow, observedNow);
  const day = dayOf(now);
  const month = monthOf(now);
  if (state.day !== day) {
    state.day = day;
    state.sessions = 0;
    state.clients = [];
  }
  if (state.month !== month) {
    state.month = month;
    state.qlooRequests = 0;
  }
  state.recentStarts = state.recentStarts.filter(stamp => stamp > now - 1000);
  state.lastNow = now;
  return now;
}

function validateCacheKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512 || /[\u0000-\u001f\u007f]/u.test(key)) {
    throw new TypeError('Cache key must contain 1 to 512 characters and no control characters.');
  }
}

function cacheIndex(value: unknown, now: number): CacheIndex {
  if (value === undefined) return { version: 1, lastNow: now, entries: [] };
  if (!isObject(value) || value.version !== 1 || !integer(value.lastNow, MAX_TIME)
      || !Array.isArray(value.entries) || value.entries.length > 128) {
    throw new Error('Stored private cache index is invalid.');
  }
  const entries: CacheIndex['entries'] = [];
  const seen = new Set<string>();
  for (const row of value.entries) {
    if (!isObject(row) || typeof row.key !== 'string' || !integer(row.writtenAt, value.lastNow)
        || !integer(row.expiresAt, MAX_TIME) || row.expiresAt <= row.writtenAt
        || row.expiresAt - row.writtenAt > MAX_TTL || seen.has(row.key)) {
      throw new Error('Stored private cache index is invalid.');
    }
    validateCacheKey(row.key);
    entries.push({ key: row.key, writtenAt: row.writtenAt, expiresAt: row.expiresAt });
    seen.add(row.key);
  }
  return { version: 1, lastNow: value.lastNow, entries };
}

function jsonPayload(value: unknown): string {
  const seen = new Set<object>();
  function validate(item: unknown): void {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || item === null || seen.has(item)) {
      throw new TypeError('Private cache values must be finite, acyclic JSON data.');
    }
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Private cache values must be plain JSON objects or arrays.');
    }
    seen.add(item);
    for (const child of Array.isArray(item) ? item : Object.values(item)) validate(child);
    seen.delete(item);
  }
  validate(value);
  return JSON.stringify(value);
}

export class UsageLedger {
  private readonly storage: LedgerStorage;
  private readonly now: () => number;
  private readonly limits: Limits;

  constructor(storage: LedgerStorage, options: LedgerOptions = {}) {
    this.storage = storage;
    this.now = options.now ?? Date.now;
    this.limits = {
      requestsPerSecond: limit(options.requestsPerSecond, 10, 10, 'requestsPerSecond'),
      monthlyQlooRequests: limit(options.monthlyQlooRequests, 50000, 50000, 'monthlyQlooRequests'),
      dailyLiveRequests: limit(options.dailyLiveRequests, 150, 1000, 'dailyLiveRequests'),
      dailyPerClientRequests: limit(options.dailyPerClientRequests, 25, 100, 'dailyPerClientRequests'),
      dailyAiSessions: limit(options.dailyAiSessions, 40, 200, 'dailyAiSessions'),
      dailyAiPerClientSessions: limit(options.dailyAiPerClientSessions, 5, 20, 'dailyAiPerClientSessions'),
      cacheTtlMs: limit(options.cacheTtlMs, 6 * 60 * 60 * 1000, MAX_TTL, 'cacheTtlMs'),
      cacheMaxEntries: limit(options.cacheMaxEntries, 128, 128, 'cacheMaxEntries'),
      cacheMaxEntryBytes: limit(options.cacheMaxEntryBytes, 256 * 1024, 512 * 1024, 'cacheMaxEntryBytes'),
    };
  }

  /** Reserve before live work starts. Invalid input and rejected work consume no allowance. */
  async reserveSession(clientHash: string): Promise<void> {
    await this.reserveDailySession(clientHash, false);
  }

  /** Separate persistent allowance: provider errors and cancelled sessions are not refunded. */
  async reserveAiSession(clientHash: string): Promise<void> {
    await this.reserveDailySession(clientHash, true);
  }

  private async reserveDailySession(clientHash: string, ai: boolean): Promise<void> {
    if (typeof clientHash !== 'string' || !SHA256.test(clientHash)) {
      throw new TypeError('Client identity must be a SHA-256 hash, never a raw address.');
    }
    await this.storage.transaction(async transaction => {
      const observedNow = timeValue(this.now());
      const key = ai ? AI_QUOTA_KEY : QUOTA_KEY;
      const state = quotaState(await transaction.get<unknown>(key), observedNow);
      const now = advanceQuota(state, observedNow);
      if (state.sessions >= (ai ? this.limits.dailyAiSessions : this.limits.dailyLiveRequests)) {
        throw new RateDenied(ai ? 'AI_DAILY_LIMIT' : 'LIVE_DAILY_LIMIT', secondsUntilDayEnd(now));
      }
      const client = state.clients.find(row => row.hash === clientHash);
      if (client !== undefined && client.count >= (ai ? this.limits.dailyAiPerClientSessions : this.limits.dailyPerClientRequests)) {
        throw new RateDenied(ai ? 'AI_CLIENT_DAILY_LIMIT' : 'LIVE_CLIENT_DAILY_LIMIT', secondsUntilDayEnd(now));
      }
      if (client === undefined) state.clients.push({ hash: clientHash, count: 1 });
      else client.count += 1;
      state.sessions += 1;
      await transaction.put(key, state);
    });
  }

  /** Add one finished session's reported usage to today's AI totals (UTC day). Failures that report nothing add nothing. */
  async recordAiUsage(usage: { inputTokens: number; outputTokens: number; costUsd: number }): Promise<void> {
    await this.storage.transaction(async transaction => {
      const day = dayOf(timeValue(this.now()));
      const prior = await transaction.get<unknown>(AI_COST_KEY);
      const base = isObject(prior) && prior.day === day && integer(prior.sessions, 1e9) && integer(prior.inputTokens, 1e12)
        && integer(prior.outputTokens, 1e12) && typeof prior.costUsd === 'number' && Number.isFinite(prior.costUsd)
        ? prior : { day, sessions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      await transaction.put(AI_COST_KEY, { day, sessions: (base.sessions as number) + 1,
        inputTokens: (base.inputTokens as number) + usage.inputTokens, outputTokens: (base.outputTokens as number) + usage.outputTokens,
        costUsd: Math.round(((base.costUsd as number) + usage.costUsd) * 10_000) / 10_000 });
    });
  }

  /** Today's recorded AI totals and reserved-session count (reserved includes failed sessions that reported no usage). */
  async aiToday(): Promise<{ day: string; reservedSessions: number; recordedSessions: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number }> {
    return this.storage.transaction(async transaction => {
      const observedNow = timeValue(this.now());
      const day = dayOf(observedNow);
      const cost = await transaction.get<unknown>(AI_COST_KEY);
      const quota = await transaction.get<unknown>(AI_QUOTA_KEY);
      const c = isObject(cost) && cost.day === day ? cost : undefined;
      const q = isObject(quota) && quota.day === day && integer(quota.sessions, 1e9) ? quota.sessions : 0;
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      return { day, reservedSessions: q, recordedSessions: n(c?.sessions), inputTokens: n(c?.inputTokens),
        outputTokens: n(c?.outputTokens), estimatedCostUsd: n(c?.costUsd) };
    });
  }

  /** Reserve immediately before every uncached provider request, including attempts that fail. */
  async acquireQlooRequest(): Promise<void> {
    await this.storage.transaction(async transaction => {
      const observedNow = timeValue(this.now());
      const state = quotaState(await transaction.get<unknown>(QUOTA_KEY), observedNow);
      const now = advanceQuota(state, observedNow);
      if (state.qlooRequests >= this.limits.monthlyQlooRequests) {
        throw new RateDenied('QLOO_MONTHLY_LIMIT', secondsUntilMonthEnd(now));
      }
      if (state.recentStarts.length >= this.limits.requestsPerSecond) {
        throw new RateDenied('QLOO_RATE_LIMIT', (state.recentStarts[0]! + 1000 - now) / 1000);
      }
      state.qlooRequests += 1;
      state.recentStarts.push(now);
      await transaction.put(QUOTA_KEY, state);
    });
  }

  private async pruneCache(transaction: LedgerTransaction, index: CacheIndex, now: number): Promise<void> {
    const retained: CacheIndex['entries'] = [];
    for (const row of index.entries) {
      if (row.expiresAt <= now) await transaction.delete(cacheKey(row.key));
      else retained.push(row);
    }
    index.entries = retained;
    index.lastNow = now;
  }

  /** Cache reads are private and never reserve a Qloo request or a live session. */
  async cacheGet<T = unknown>(key: string): Promise<T | undefined> {
    validateCacheKey(key);
    return this.storage.transaction(async transaction => {
      const observedNow = timeValue(this.now());
      const index = cacheIndex(await transaction.get<unknown>(CACHE_INDEX_KEY), observedNow);
      const now = Math.max(index.lastNow, observedNow);
      await this.pruneCache(transaction, index, now);
      const row = index.entries.find(entry => entry.key === key);
      let payload: string | undefined;
      if (row !== undefined) {
        const stored = await transaction.get<unknown>(cacheKey(key));
        if (isObject(stored) && stored.version === 1 && stored.expiresAt === row.expiresAt
            && typeof stored.payload === 'string'
            && new TextEncoder().encode(stored.payload).byteLength <= this.limits.cacheMaxEntryBytes) {
          payload = stored.payload;
        } else {
          await transaction.delete(cacheKey(key));
          index.entries = index.entries.filter(entry => entry.key !== key);
        }
      }
      await transaction.put(CACHE_INDEX_KEY, index);
      if (payload === undefined) return undefined;
      try { return JSON.parse(payload) as T; }
      catch {
        await transaction.delete(cacheKey(key));
        index.entries = index.entries.filter(entry => entry.key !== key);
        await transaction.put(CACHE_INDEX_KEY, index);
        return undefined;
      }
    });
  }

  /** Oversized valid results are deliberately not cached; callers can still use them. */
  async cachePut(key: string, value: unknown, ttlMs = this.limits.cacheTtlMs): Promise<void> {
    validateCacheKey(key);
    const ttl = limit(ttlMs, this.limits.cacheTtlMs, MAX_TTL, 'cache TTL');
    const payload = jsonPayload(value);
    if (new TextEncoder().encode(payload).byteLength > this.limits.cacheMaxEntryBytes) return;
    await this.storage.transaction(async transaction => {
      const observedNow = timeValue(this.now());
      const index = cacheIndex(await transaction.get<unknown>(CACHE_INDEX_KEY), observedNow);
      const now = Math.max(index.lastNow, observedNow);
      if (now + ttl > MAX_TIME) throw new RangeError('Cache expiry exceeds the supported UTC calendar.');
      await this.pruneCache(transaction, index, now);
      index.entries = index.entries.filter(entry => entry.key !== key);
      index.entries.sort((a, b) => a.writtenAt - b.writtenAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      while (index.entries.length >= this.limits.cacheMaxEntries) {
        await transaction.delete(cacheKey(index.entries.shift()!.key));
      }
      const expiresAt = now + ttl;
      const entry: CacheEntry = { version: 1, expiresAt, payload };
      await transaction.put(cacheKey(key), entry);
      index.entries.push({ key, writtenAt: now, expiresAt });
      await transaction.put(CACHE_INDEX_KEY, index);
    });
  }
}
