/** Small server-only Anthropic Messages adapter. No provider error body reaches a client. */
export const AI_MODEL = 'claude-sonnet-5-5';
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const AI_PROVIDER_LIMITS = {
  maxRequestBytes: 131_072,
  maxResponseBytes: 524_288,
  maxTokensPerRequest: 2_000,
  requestTimeoutMs: 40_000,
} as const;

export type JsonRecord = Record<string, unknown>;
export interface AnthropicMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly JsonRecord[];
}
export interface AnthropicUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly searchRequests: number;
  readonly fetchRequests: number;
}
export interface AnthropicResponse {
  readonly id: string;
  readonly content: readonly JsonRecord[];
  readonly stopReason: 'end_turn' | 'tool_use' | 'pause_turn' | 'max_tokens' | 'refusal' | 'stop_sequence' | 'model_context_window_exceeded';
  readonly usage: AnthropicUsage;
}
export interface AnthropicRequest {
  readonly system: string;
  readonly messages: readonly AnthropicMessage[];
  readonly tools: readonly JsonRecord[];
  readonly maxTokens: number;
  readonly signal?: AbortSignal;
}
export interface AnthropicClientOptions {
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
  /** Test hook may shorten a timeout, never increase the production bound. */
  readonly timeoutMs?: number;
}

export class AiProviderError extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number | undefined;
  constructor(code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const invalid = () => new AiProviderError('AI_INVALID_RESPONSE', 'The AI provider returned an unsupported response; no new proposal was accepted.');

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 10_000_000) throw invalid();
  return value;
}

function parseResponse(value: unknown): AnthropicResponse {
  if (!isRecord(value) || value.type !== 'message' || value.role !== 'assistant'
      || value.model !== AI_MODEL || typeof value.id !== 'string' || value.id.length > 200 || value.id.length === 0
      || !Array.isArray(value.content) || value.content.length > 64 || !value.content.every(isRecord)
      || !isRecord(value.usage)
      || !['end_turn', 'tool_use', 'pause_turn', 'max_tokens', 'refusal', 'stop_sequence', 'model_context_window_exceeded'].includes(String(value.stop_reason))) throw invalid();
  const usage = value.usage;
  const server = usage.server_tool_use;
  if (server !== undefined && !isRecord(server)) throw invalid();
  const inputTokens = integer(usage.input_tokens) + integer(usage.cache_creation_input_tokens ?? 0)
    + integer(usage.cache_read_input_tokens ?? 0);
  return {
    id: value.id, content: value.content,
    stopReason: value.stop_reason as AnthropicResponse['stopReason'],
    usage: { inputTokens, outputTokens: integer(usage.output_tokens),
      searchRequests: integer(server?.web_search_requests ?? 0), fetchRequests: integer(server?.web_fetch_requests ?? 0) },
  };
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('Content-Length'));
  if (declared > AI_PROVIDER_LIMITS.maxResponseBytes) {
    await response.body?.cancel();
    throw invalid();
  }
  if (!response.body) throw invalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > AI_PROVIDER_LIMITS.maxResponseBytes) { await reader.cancel(); throw invalid(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } finally { reader.releaseLock(); }
}

/** Tool definitions and assistant blocks remain unchanged on continuation. No hidden retries. */
export function createAnthropicClient(options: AnthropicClientOptions) {
  if (typeof options.apiKey !== 'string' || !options.apiKey.trim()) {
    throw new AiProviderError('AI_DISABLED', 'AI Rescue live mode is not configured.');
  }
  const timeoutMs = options.timeoutMs ?? AI_PROVIDER_LIMITS.requestTimeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > AI_PROVIDER_LIMITS.requestTimeoutMs) {
    throw new RangeError('AI request timeout exceeds the supported bound.');
  }
  const transport = options.fetch ?? fetch;
  return {
    async message(request: AnthropicRequest): Promise<AnthropicResponse> {
      if (!Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1
          || request.maxTokens > AI_PROVIDER_LIMITS.maxTokensPerRequest) {
        throw new AiProviderError('AI_TOKEN_LIMIT', 'The AI output token budget has been reached.');
      }
      const body = JSON.stringify({ model: AI_MODEL, max_tokens: request.maxTokens,
        thinking: { type: 'between_tools' }, output_config: { effort: 'medium' },
        tool_choice: { type: 'auto' }, system: request.system,
        messages: request.messages, tools: request.tools });
      if (new TextEncoder().encode(body).byteLength > AI_PROVIDER_LIMITS.maxRequestBytes) {
        throw new AiProviderError('AI_CONTEXT_LIMIT', 'The AI context size limit has been reached.');
      }
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout]);
      if (signal.aborted) throw new AiProviderError('AI_CANCELLED', 'The AI session was cancelled.');
      try {
        const response = await transport(ANTHROPIC_MESSAGES_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': options.apiKey,
            'anthropic-version': '2023-06-01' }, body, signal, redirect: 'manual',
        });
        if (!response.ok) {
          await response.body?.cancel();
          const retry = Number(response.headers.get('Retry-After'));
          if (response.status === 429) throw new AiProviderError('AI_RATE_LIMIT', 'The AI provider is rate limited; try again later.',
            Number.isFinite(retry) && retry > 0 ? Math.min(3600, Math.ceil(retry)) : 60);
          if (response.status === 401 || response.status === 403) throw new AiProviderError('AI_AUTH_UNAVAILABLE', 'The AI provider access needs maintainer attention.');
          if (response.status === 404) throw new AiProviderError('AI_MODEL_UNAVAILABLE', 'The configured Claude Sonnet 5.5 model is unavailable to this account.');
          throw new AiProviderError('AI_PROVIDER_UNAVAILABLE', 'The AI provider could not complete this request; no new proposal was accepted.');
        }
        const parsed = parseResponse(await boundedJson(response));
        if (parsed.usage.outputTokens > request.maxTokens) throw invalid();
        return parsed;
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (signal.aborted) throw new AiProviderError(request.signal?.aborted ? 'AI_CANCELLED' : 'AI_TIMEOUT',
          request.signal?.aborted ? 'The AI session was cancelled.' : 'The AI provider exceeded the request time limit.');
        // Network exceptions, JSON errors and provider bodies may contain credentials or page content.
        throw new AiProviderError('AI_PROVIDER_UNAVAILABLE', 'The AI provider response could not be read; no new proposal was accepted.');
      }
    },
  };
}
