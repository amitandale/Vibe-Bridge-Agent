// lib/preflight/health.mjs
// Probe /health with timeout and optional retries.
// Returns 'ok' | 'degraded'. Throws HEALTH_UNAVAILABLE on timeout or non-2xx.

function makeErr(code, message, data) {
  const e = new Error(`${code} ${message}`);
  e.name = 'PreflightError';
  e.code = code;
  if (data) e.data = data;
  return e;
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number, retries?: number, fetch?: Function }} opts
 * @returns {Promise<'ok'|'degraded'>}
 */
export async function probeHealth(url, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 2000;
  const retries = Number.isFinite(opts.retries) ? opts.retries : 1;
  const fetchFn = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchFn) throw makeErr('HEALTH_UNAVAILABLE', 'fetch not available', { url });

  let attempt = 0;
  let lastErr = null;
  while (attempt <= retries) {
    attempt++;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetchFn(url, { signal: controller.signal });
      clearTimeout(id);

      if (!res || !res.ok) {
        const status = res && typeof res.status !== 'undefined' ? res.status : 'ERR';
        throw makeErr('HEALTH_UNAVAILABLE', `HTTP ${status}`, { url, status });
      }
      let statusText = 'ok';
      try {
        const body = await res.json();
        const s = body && body.status;
        if (s === 'ok' || s === 'degraded') statusText = s;
      } catch {
        // Non-JSON body; default to ok on HTTP 200.
        statusText = 'ok';
      }
      return statusText;
    } catch (e) {
      lastErr = e;
      if (attempt > retries) break;
      await new Promise(r => setTimeout(r, 0));
    }
  }
  throw (lastErr || makeErr('HEALTH_UNAVAILABLE', 'unknown error', { url }));
}
