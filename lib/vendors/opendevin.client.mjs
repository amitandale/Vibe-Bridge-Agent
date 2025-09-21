// lib/vendors/opendevin.client.mjs
// Thin HTTP client for OpenDevin/OpenHands. ESM only.
import crypto from 'node:crypto';

function hex(buf){ return Buffer.from(buf).toString('hex'); }

async function mapError(status, payload){
  // Lazy map to repo taxonomy if available, else fall back to strings.
  try {
    const mod = await import('../obs/errors.mjs'); // relative from vendors/
    const Codes = mod?.Codes || mod?.default || {};
    switch (status) {
      case 401: return Codes.UNAUTHENTICATED || 'UNAUTHENTICATED';
      case 403: return Codes.FORBIDDEN || 'FORBIDDEN';
      case 404: return Codes.NOT_FOUND || 'NOT_FOUND';
      case 429: return Codes.RATE_LIMITED || 'RATE_LIMITED';
      case 503: return Codes.UPSTREAM_UNAVAILABLE || 'UPSTREAM_UNAVAILABLE';
      default:  return Codes.INTERNAL || 'INTERNAL';
    }
  } catch {
    switch (status) {
      case 401: return 'UNAUTHENTICATED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 429: return 'RATE_LIMITED';
      case 503: return 'UPSTREAM_UNAVAILABLE';
      default:  return 'INTERNAL';
    }
  }
}

function signHeaders(bodyStr, { project, kid, key }){
  const h = crypto.createHmac('sha256', String(key || ''));
  h.update(Buffer.from(bodyStr || '', 'utf8'));
  const digest = hex(h.digest());
  return {
    'x-vibe-project': String(project || ''),
    'x-vibe-kid': String(kid || ''),
    'x-signature': `sha256=${digest}`,
  };
}

function backoffMs(attempt, retryAfterSec){
  if (typeof retryAfterSec === 'number' && retryAfterSec >= 0) {
    return Math.min(10000, Math.round(retryAfterSec * 1000));
  }
  const base = 200;
  return Math.min(2000, base * Math.pow(2, attempt)); // 200, 400
}

async function httpJson(url, { method='POST', body, headers={}, timeoutMs=10000, retries=2, fetchImpl }){
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('fetch not available');
  const payload = body != null ? JSON.stringify(body) : '';
  let lastErr;
  for (let attempt=0; attempt<=retries; attempt++){
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);
    try {
      const res = await fetchFn(url, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: payload,
        signal: ac.signal
      });
      clearTimeout(t);
      if (res.ok){
        const txt = await res.text();
        return txt ? JSON.parse(txt) : {};
      }
      // Retry policy: 429/5xx
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)){
        if (attempt < retries){
          const ra = res.headers.get('retry-after');
          const raNum = ra ? Number(ra) : undefined;
          await new Promise(r => setTimeout(r, backoffMs(attempt, Number.isFinite(raNum) ? raNum : undefined)));
          continue;
        }
      }
      const errPayload = await res.text().catch(()=>'') || '';
      const code = await mapError(res.status, errPayload);
      const e = new Error(`OpenDevin error ${res.status}`);
      e.status = res.status;
      e.code = code;
      e.payload = errPayload;
      throw e;
    } catch (e){
      clearTimeout(t);
      lastErr = e;
      // Abort/timeouts/network => retry if attempts remain
      const isAbort = e?.name === 'AbortError' || e?.message === 'timeout';
      if ((isAbort || e?.code === 'ECONNRESET' || e?.code === 'ENETUNREACH' || e?.code === 'EAI_AGAIN') && attempt < retries){
        await new Promise(r => setTimeout(r, backoffMs(attempt)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('OpenDevin request failed');
}

function makeBase({ fetchImpl } = {}){
  const baseUrl = process.env.OPENDEVIN_URL || '';
  const project = process.env.VENDOR_HMAC_PROJECT || '';
  const kid = process.env.VENDOR_HMAC_KID || '';
  const key = process.env.VENDOR_HMAC_KEY || '';
  if (!baseUrl) {
    // In CI we rely on injected fetchImpl; still allow empty base if tests hit URLs directly.
  }
  const hmac = { project, kid, key };
  return { baseUrl, hmac, fetchImpl };
}

async function call(endpoint, payload, opts={}){
  const { baseUrl, hmac, fetchImpl } = makeBase(opts);
  const bodyStr = JSON.stringify(payload || {});
  const headers = { ...signHeaders(bodyStr, hmac) };
  if (opts?.idempotencyKey) headers['x-idempotency-key'] = String(opts.idempotencyKey);
  return httpJson(`${baseUrl}${endpoint}`, { method:'POST', body: payload, headers, timeoutMs: opts?.timeoutMs ?? 10000, retries: 2, fetchImpl });
}

// Public API
export async function preparePr({ owner, repo, base, branch, title, body, labels }, opts={}){
  const res = await call('/github/prepare_pr', { owner, repo, base, branch, title, body, labels }, opts);
  return {
    prNumber: Number(res?.prNumber ?? res?.pr ?? 0),
    branchUrl: String(res?.branchUrl || ''),
    htmlUrl: String(res?.htmlUrl || ''),
  };
}

export async function exec({ cwd, shell, commands, env, timeoutMs, idempotencyKey }, opts={}){
  const res = await call('/exec/run', { cwd, shell, commands, env, timeoutMs, idempotencyKey }, { ...opts, timeoutMs });
  return {
    stdout: String(res?.stdout ?? ''),
    stderr: String(res?.stderr ?? ''),
    exitCode: Number(res?.exitCode ?? 0),
    durationMs: Number(res?.durationMs ?? 0)
  };
}

export default { preparePr, exec };
