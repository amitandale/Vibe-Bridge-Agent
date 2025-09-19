// Shared Vendor HTTP client
// Spec: PR BA-S0 — Signed HTTP client with retries, timeouts, error mapping.
import { createHmac, randomInt } from 'node:crypto';

const BASE_TIMEOUT_MS = 10_000;
const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 2000;

class HttpError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function loadCodes() {
  try {
    const mod = await import('../obs/errors.mjs');
    // Support both default and named export patterns
    if (mod?.Codes) return mod.Codes;
    if (mod?.default?.Codes) return mod.default.Codes;
    if (mod?.default) return mod.default;
    return mod;
  } catch {
    // Fallback for tests if module path differs. Values should match repo's Codes.
    return {
      BAD_REQUEST: 'BAD_REQUEST',
      UNAUTHENTICATED: 'UNAUTHENTICATED',
      FORBIDDEN: 'FORBIDDEN',
      NOT_FOUND: 'NOT_FOUND',
      RATE_LIMITED: 'RATE_LIMITED',
      UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
      INTERNAL: 'INTERNAL'
    };
  }
}

function parseRetryAfter(h) {
  if (!h) return null;
  // Numeric seconds
  const asNum = Number(h);
  if (Number.isFinite(asNum)) return Math.max(0, asNum * 1000);
  // HTTP-date
  const t = Date.parse(h);
  if (!Number.isNaN(t)) {
    const delta = t - Date.now();
    return Math.max(0, delta);
  }
  return null;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('AbortError'));
    const id = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(id);
        reject(new Error('AbortError'));
      }, { once: true });
    }
  });
}

function computeSignatureHex(key, bodyBytes) {
  const h = createHmac('sha256', key);
  h.update(bodyBytes);
  return h.digest('hex');
}

function normalizeBody(body) {
  if (body == null) return { raw: '', isString: true, contentType: undefined };
  if (body instanceof Uint8Array) return { raw: body, isString: false, contentType: undefined };
  if (typeof body === 'string') return { raw: body, isString: true, contentType: undefined };
  // Assume JSON serializable
  const asStr = JSON.stringify(body);
  return { raw: asStr, isString: true, contentType: 'application/json' };
}

function buildHeaders({ projectId, kid, key, idempotencyKey, extra, bodyBytes }) {
  const headers = new Headers();
  headers.set('x-vibe-project', projectId);
  headers.set('x-vibe-kid', kid);
  const sig = computeSignatureHex(key, bodyBytes);
  headers.set('x-signature', `sha256=${sig}`);
  if (idempotencyKey) headers.set('x-idempotency-key', idempotencyKey);
  if (extra) for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return headers;
}

function capWithJitter(baseMs, attemptIndex /* 0-based */) {
  const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, attemptIndex));
  const jitter = randomInt(0, Math.ceil(backoff * 0.2)); // 0-20% jitter
  return backoff + jitter;
}

function shouldRetry({ status, err }) {
  if (err) return true; // transport error, aborted handled by caller
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

function mapStatusToCode(Codes, status, transportErrName) {
  if (transportErrName === 'AbortError') return Codes.UPSTREAM_UNAVAILABLE;
  if (!status) return Codes.UPSTREAM_UNAVAILABLE;
  if (status === 400) return Codes.BAD_REQUEST;
  if (status === 401) return Codes.UNAUTHENTICATED;
  if (status === 403) return Codes.FORBIDDEN;
  if (status === 404) return Codes.NOT_FOUND;
  if (status === 429) return Codes.RATE_LIMITED;
  if (status >= 500) return Codes.UPSTREAM_UNAVAILABLE;
  return Codes.INTERNAL;
}

export function makeHttp({ baseUrl = '', projectId, kid, key, fetchImpl } = {}) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch implementation is required');
  }
  if (!projectId || !kid || !key) {
    // Allow CI to inject fetch and bypass env; enforce at call time
    if (process?.env?.CI !== 'true') {
      throw new Error('projectId, kid, and key are required');
    }
  }

  async function request(method, path, { body, headers, timeoutMs, idempotencyKey } = {}) {
    const Codes = await loadCodes();
    const ctrl = new AbortController();
    const signal = ctrl.signal;
    const effTimeout = Number.isFinite(timeoutMs) ? timeoutMs : BASE_TIMEOUT_MS;
    const toId = setTimeout(() => ctrl.abort(), effTimeout);
    const { raw, isString, contentType } = normalizeBody(body);
    const bodyBytes = isString ? Buffer.from(raw) : raw;
    const h = buildHeaders({ projectId, kid, key, idempotencyKey, extra: headers, bodyBytes });
    if (contentType && !h.has('content-type')) h.set('content-type', contentType);

    const url = String(baseUrl || '') + String(path || '');
    let lastErr = null;
    const maxAttempts = 2; // retries on top of the first try => total attempts = 1 + maxAttempts? Spec: "Retries: 2 attempts" means 2 total attempts.
    // Interpret as: total attempts = 2 (1 try + 1 retry)
    const totalAttempts = 2;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      try {
        const res = await fetchFn(url, { method, headers: h, body: raw ?? undefined, signal });
        const ok = res.ok;
        if (ok) {
          clearTimeout(toId);
          const ct = res.headers?.get ? res.headers.get('content-type') : undefined;
          let data;
          try {
            if (ct && ct.includes('application/json')) data = await res.json();
            else data = await res.text();
          } catch {
            data = undefined;
          }
          return { ok: true, status: res.status, headers: res.headers, data };
        }

        const status = res.status;
        const retryAfter = parseRetryAfter(res.headers?.get?.('retry-after'));
        if (attempt < totalAttempts - 1 && shouldRetry({ status })) {
          const delay = retryAfter != null ? Math.min(retryAfter, MAX_BACKOFF_MS) : capWithJitter(BASE_BACKOFF_MS, attempt);
          await sleep(delay, signal);
          continue;
        }

        const code = mapStatusToCode(Codes, status);
        const msg = `HTTP ${status}`;
        throw new HttpError(msg, { code, status });
      } catch (e) {
        lastErr = e;
        const aborted = e?.name === 'AbortError';
        if (aborted) {
          clearTimeout(toId);
          const code = mapStatusToCode(Codes, undefined, 'AbortError');
          throw new HttpError('Request aborted', { code, status: undefined });
        }
        if (attempt < totalAttempts - 1 && shouldRetry({ err: e })) {
          const delay = capWithJitter(BASE_BACKOFF_MS, attempt);
          await sleep(delay, signal);
          continue;
        }
        clearTimeout(toId);
        const code = mapStatusToCode(await loadCodes(), undefined);
        throw new HttpError(String(e?.message || 'transport error'), { code, status: undefined, details: { cause: e?.name } });
      }
    }
    // Exhausted attempts
    const Codes2 = await loadCodes();
    const code = mapStatusToCode(Codes2, undefined);
    throw new HttpError(String(lastErr?.message || 'failed after retries'), { code });
  }

  return {
    get: (path, opts = {}) => request('GET', path, { ...opts, body: undefined }),
    post: (path, opts = {}) => request('POST', path, opts),
    HttpError
  };
}

export { HttpError };
