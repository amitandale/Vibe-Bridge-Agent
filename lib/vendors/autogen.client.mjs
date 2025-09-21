// lib/vendors/autogen.client.mjs
// Overlay S2-A: Thin HTTP client for AutoGen. Default export has runAgents().
// Uses BA-S0 makeHttp() if available, else falls back to global fetch.
// Signs body with HMAC using VENDOR_HMAC_* and adds headers.
// Retries 2 times on 429/5xx and on timeout. Timeout default 10_000ms.

import { createHmac } from 'node:crypto';

function env(name, fallback = undefined) {
  const v = (typeof process !== 'undefined' && process.env && process.env[name]) || undefined;
  return v !== undefined ? v : fallback;
}

function toHex(buf) {
  return Array.prototype.map.call(buf, (x) => ('00' + x.toString(16)).slice(-2)).join('');
}

function hmacSha256Hex(key, bodyStr) {
  // Use hex key only if it is a 64-char hex string, else treat as UTF-8.
  const isHex = /^[0-9a-fA-F]{64}$/.test(key || '');
  const keyBuf = Buffer.from(String(key ?? ''), isHex ? 'hex' : 'utf8');
  const mac = createHmac('sha256', keyBuf).update(bodyStr, 'utf8').digest();
  return 'sha256=' + mac.toString('hex');

}
function mapStatusToCode(status) {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'UPSTREAM_UNAVAILABLE';
  if (status >= 500) return 'UPSTREAM_UNAVAILABLE';
  return 'BAD_UPSTREAM';
}

function makeError(code, message, details = {}, status = 0) {
  const e = new Error(message || code);
  e.code = code;
  e.status = status;
  e.details = details;
  return e;
}

async function maybeLoadMakeHttp() {
  try {
    // Prefer BA-S0 helper if present
    const mod = await import('../http.mjs').catch(async () => {
      return await import('../vendors/http.mjs');
    });
    // Support both default export and named
    const makeHttp = (mod && (mod.default || mod.makeHttp)) || null;
    if (makeHttp) return makeHttp;
  } catch {}
  return null;
}

async function fetchWithTimeout(url, options, timeoutMs, fetchImpl) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const opts = { ...options };
  if (controller) opts.signal = controller.signal;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { controller && controller.abort(); } catch {}
  }, timeoutMs);
  try {
    const fetchFn = fetchImpl || globalThis.fetch;
    const res = await fetchFn(url, opts);
    return { res, timedOut: false };
  } finally {
    clearTimeout(timer);
    if (timedOut) return { res: undefined, timedOut: true };
  }
}

async function doRequest(url, bodyStr, timeoutMs, retries, fetchImpl){
  const project = env('VENDOR_HMAC_PROJECT', '');
  const kid = env('VENDOR_HMAC_KID', '');
  const key = env('VENDOR_HMAC_KEY', '');

  const headers = {
    'content-type': 'application/json',
    'accept': 'application/json',
    'x-vibe-project': project,
    'x-vibe-kid': kid,
    'x-signature': hmacSha256Hex(key, bodyStr),
  };

  // Pass through idempotency key header if present
  let __idem = '';
  try { __idem = JSON.parse(bodyStr).idempotencyKey || ''; } catch {}
  if (__idem) headers['x-idempotency-key'] = __idem;

  // Optional repo Codes mapping
  let __Codes = null;
  try { const __mod = await import('../codes.mjs'); __Codes = (__mod && __mod.Codes) || null; } catch {}
  const __mapCode = (s) => (__Codes && __Codes[s]) ? __Codes[s] : s;


  // Try to use makeHttp if available
  const makeHttp = await maybeLoadMakeHttp();
  const http = makeHttp ? makeHttp({ timeoutMs }) : null;

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let res;
      if (http && typeof http.fetch === 'function') {
        res = await http.fetch(url, { method: 'POST', headers, body: bodyStr });
      } else {
        const r = await fetchWithTimeout(url, { method: 'POST', headers, body: bodyStr }, timeoutMs, fetchImpl);
        if (r.timedOut) throw makeError(__mapCode('UPSTREAM_UNAVAILABLE'), 'autogen timeout', {}, 0);
        res = r.res;
      }

      if (!res) throw makeError('UPSTREAM_UNAVAILABLE', 'no response', {}, 0);

      if (res.status >= 200 && res.status < 300) {
        const payload = await res.json().catch(() => ({}));
        return payload;
      }

      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const base = 250 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 125);
        await new Promise(r => setTimeout(r, base + jitter));
        continue;
      }

      const code = __mapCode(mapStatusToCode(res.status));
      const text = await res.text().catch(() => '');
      throw makeError(code, `autogen ${res.status}`, { body: text }, res.status);

    } catch (err) {
      lastErr = err;
      // Retry on timeouts or network-like errors
      const code = err && err.code;
      if ((code === 'UPSTREAM_UNAVAILABLE' || err.name === 'AbortError') && attempt < retries) {
        const base = 250 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 125);
        await new Promise(r => setTimeout(r, base + jitter));
        continue;
      }
      break;
    }
  }
  if (lastErr) throw lastErr;
  throw makeError('UPSTREAM_UNAVAILABLE', 'autogen failed', {}, 0);
}

async function runAgents({ teamConfig = {}, messages = [], contextRefs = [], idempotencyKey = '' } = {}) {
  const baseUrl = env('AUTOGEN_URL', 'http://autogen.invalid');
  const timeoutMs = Number(env('AUTOGEN_TIMEOUT_MS', '10000')) || 10000;
  const retries = Number(env('AUTOGEN_RETRIES', '2')) || 2;

  const payload = { teamConfig, messages, contextRefs, idempotencyKey };
  const bodyStr = JSON.stringify(payload);

  const url = `${baseUrl.replace(/\/+$/, '')}/run-agents`;

  const json = await doRequest(url, bodyStr, timeoutMs, retries, opts.fetchImpl);

  // Minimal shape validation
  const artifacts = json && json.artifacts ? json.artifacts : { patches: [], tests: [] };
  const transcript = json && json.transcript ? json.transcript : [];
  const result = {
    transcript,
    artifacts: {
      patches: Array.isArray(artifacts.patches) ? artifacts.patches : [],
      tests: Array.isArray(artifacts.tests) ? artifacts.tests : []
    }
  };
  return result;
}

const api = { runAgents };
api['run-agents'] = runAgents;
export default api;
