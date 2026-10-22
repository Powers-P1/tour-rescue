export const API_VERSION = '0.7.0-knowledge';
export const DEFAULT_ORIGIN = 'https://tour-rescue.pages.dev';
const MAX_BODY_BYTES = 16_384;

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(value: unknown, status = 200, headers?: ConstructorParameters<typeof Headers>[0]): Response {
  const combined = new Headers(headers);
  combined.set('Content-Type', 'application/json; charset=utf-8');
  combined.set('Cache-Control', 'no-store');
  combined.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(value), { status, headers: combined });
}

export function problem(status: number, code: string, message: string, retryAfterSeconds?: number): Response {
  return json({ error: { code, message } }, status,
    retryAfterSeconds === undefined ? undefined : { 'Retry-After': String(retryAfterSeconds) });
}

/** Bound bytes before JSON.parse, including bodies without Content-Length. */
export async function readJson(request: Request, maximumBytes = MAX_BODY_BYTES): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
    throw new HttpError(415, 'JSON_REQUIRED', 'Use Content-Type: application/json.');
  }
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > maximumBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'The request body exceeds the size limit.');
  }
  if (request.body === null) throw new HttpError(400, 'INVALID_JSON', 'A JSON object is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new HttpError(413, 'BODY_TOO_LARGE', 'The request body exceeds the size limit.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'INVALID_JSON', 'The body must be valid UTF-8 JSON.');
  } finally {
    reader.releaseLock();
  }
}

export function inputObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new HttpError(400, 'INVALID_INPUT', 'The request contains unsupported fields or is not an object.');
  }
  return value as Record<string, unknown>;
}
