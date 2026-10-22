import { aiEnabled, allowedOrigin, caps, liveEnabled } from './config.ts';
import type { WorkerEnv } from './config.ts';
import { API_VERSION, HttpError, inputObject, json, problem, readJson } from './http.ts';

export const LEDGER_NAME = 'tour-rescue-global-v1';

async function dailyClientHash(ip: string, key: string, time: number): Promise<string> {
  const bytes = new TextEncoder();
  const secret = await crypto.subtle.importKey('raw', bytes.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const day = new Date(time).toISOString().slice(0, 10);
  const digest = await crypto.subtle.sign('HMAC', secret, bytes.encode(`tour-rescue-ip-v1:${day}:${ip}`));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function withCors(response: Response, origin: string | null, configuredOrigin: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Origin');
  if (origin === configuredOrigin) headers.set('Access-Control-Allow-Origin', configuredOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Expose-Headers', 'Retry-After, Content-Disposition');
  return new Response(response.body, { status: response.status, headers });
}

/** The edge layer only bounds requests and forwards to the existing SQLite DO. */
export async function handleWorkerRequest(request: Request, env: WorkerEnv, now = Date.now): Promise<Response> {
  let configuredOrigin: string;
  try { configuredOrigin = allowedOrigin(env); }
  catch { return problem(503, 'CONFIGURATION_ERROR', 'The service configuration needs maintainer attention.'); }
  const origin = request.headers.get('Origin');
  const finish = (response: Response) => withCors(response, origin, configuredOrigin);
  if (origin !== null && origin !== configuredOrigin) return finish(problem(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.'));
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return finish(new Response(null, { status: 204 }));
  if (url.search !== '') return finish(problem(400, 'QUERY_NOT_ALLOWED', 'Use the documented path and JSON body; URL parameters are not supported.'));
  if (url.pathname === '/health') {
    if (request.method !== 'GET') return finish(problem(405, 'METHOD_NOT_ALLOWED', 'Use GET.'));
    let aiToday: unknown = null;
    if (aiEnabled(env)) {
      try {
        const stub = env.UNIT_LEDGER.get(env.UNIT_LEDGER.idFromName(LEDGER_NAME));
        const reply = await stub.fetch(new Request('https://unit-ledger.internal/ai/usage', { method: 'GET' }));
        if (reply.ok) aiToday = await reply.json();
      } catch { aiToday = null; }
    }
    return finish(json({ ok: true, version: API_VERSION, liveEnabled: liveEnabled(env), aiEnabled: aiEnabled(env),
      caps: caps(env), aiToday }));
  }
  const internal = ({ '/do-check': '/health', '/api/demo': '/demo', '/api/demo/audit': '/demo/audit',
    '/api/live': '/live', '/api/live/search': '/search', '/api/ai/live': '/ai/live' } as Record<string, string>)[url.pathname];
  if (internal === undefined) return finish(problem(404, 'NOT_FOUND', 'No such API route.'));
  const ai = internal === '/ai/live';
  const live = internal === '/live' || internal === '/search' || ai;
  if (request.method !== (live ? 'POST' : 'GET')) return finish(problem(405, 'METHOD_NOT_ALLOWED', live ? 'Use POST.' : 'Use GET.'));
  if (live && !liveEnabled(env)) return finish(problem(503, 'LIVE_DISABLED', 'Live mode is disabled; the labelled demo remains available.'));
  if (ai && !aiEnabled(env)) return finish(problem(503, 'AI_DISABLED', 'AI Rescue live mode is disabled; saved demo transcripts remain available.'));
  try {
    const headers = new Headers();
    let body: string | undefined;
    if (live) {
      const ip = request.headers.get('CF-Connecting-IP');
      if (ip === null || !/^[0-9a-fA-F.:]{3,64}$/.test(ip)) {
        return finish(problem(503, 'CLIENT_ID_UNAVAILABLE', 'A trusted Cloudflare client address is required for live mode.'));
      }
      const input = await readJson(request,ai?48_000:16_384);
      // Projection and exact field validation happen again in the DO before any reservation.
      inputObject(input, ai ? ['baseRunId', 'policy', 'additionalBudgetMinorUnits','knowledge','skill'] : internal === '/search' ? ['query'] :
        ['scenarioId', 'targetArtistId', 'comparisonArtistIds', 'controlArtistId', 'policy', 'additionalBudgetMinorUnits']);
      body = JSON.stringify(input);
      headers.set('Content-Type', 'application/json');
      headers.set('X-Tour-Client', await dailyClientHash(ip, env.QLOO_API_KEY!, now()));
    }
    const stub = env.UNIT_LEDGER.get(env.UNIT_LEDGER.idFromName(LEDGER_NAME));
    const forwarded = new Request(`https://unit-ledger.internal${internal}`, {
      method: live ? 'POST' : 'GET', headers, signal: request.signal, ...(body === undefined ? {} : { body }),
    });
    return finish(await stub.fetch(forwarded));
  } catch (error) {
    if (error instanceof HttpError) return finish(problem(error.status, error.code, error.message));
    return finish(problem(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.'));
  }
}
