// lib/llm/util/errors.mjs
export function mapStatusToCode(status){
  if (status === 401) return { code: 'PROVIDER_UNAUTHORIZED', retryable: false };
  if (status === 403) return { code: 'PROVIDER_FORBIDDEN', retryable: false };
  if (status === 404) return { code: 'PROVIDER_NOT_FOUND', retryable: false };
  if (status === 429) return { code: 'RATE_LIMITED', retryable: true };
  if (status >= 500 && status <= 599) return { code: 'UPSTREAM_UNAVAILABLE', retryable: true };
  return { code: 'UPSTREAM_ERROR', retryable: false };
}

export class LlmError extends Error {
  constructor(message, { code='UPSTREAM_ERROR', status=0 } = {}){
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.status = status;
  }
}

export function parseRetryAfter(h){
  if (!h) return 0;
  const s = String(h).trim();
  const secs = Number(s);
  if (!Number.isNaN(secs)) return Math.max(0, Math.floor(secs * 1000));
  const t = Date.parse(s);
  if (!Number.isNaN(t)){
    const ms = t - Date.now();
    return Math.max(0, ms);
  }
  return 0;
}
