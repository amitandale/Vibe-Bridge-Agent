// lib/preflight/health.mjs
// Health probe with timeout and retry. Returns { status: 'ok'|'degraded', httpStatus }
function timeoutAfter(ms){
  return new Promise((_, rej) => {
    const t = setTimeout(() => {
      clearTimeout(t);
      const e = new Error('timeout');
      e.code = 'HEALTH_UNAVAILABLE';
      e.details = { reason: 'timeout' };
      rej(e);
    }, ms);
  });
}

function parseStatus(ok, status, body){
  // Try to parse JSON {status}
  let st = null;
  if (typeof body === 'string'){
    try { const o = JSON.parse(body); st = o?.status; } catch {}
  } else if (body && typeof body === 'object'){
    st = body.status;
  }
  if (!ok){
    const e = new Error(`health http ${status}`);
    e.code = 'HEALTH_UNAVAILABLE';
    e.details = { reason: 'http', status };
    throw e;
  }
  if (st === 'ok' || st === 'degraded'){
    return st;
  }
  // Default to 'ok' on 2xx when body missing
  return 'ok';
}

export async function probeHealth(url, { timeoutMs = parseInt(process.env.PREINVOKE_HEALTH_TIMEOUT_MS||'2000',10), retries = 1, fetchImpl } = {}){
  const _fetch = fetchImpl || globalThis.fetch;
  if (typeof _fetch !== 'function') {
    const e = new Error('fetch not available');
    e.code = 'HEALTH_UNAVAILABLE';
    e.details = { reason: 'nofetch' };
    throw e;
  }
  let lastErr = null;
  for (let attempt=0; attempt <= retries; attempt++){
    try {
      const res = await Promise.race([
        _fetch(url),
        timeoutAfter(timeoutMs)
      ]);
      const bodyText = typeof res.text === 'function' ? await res.text() : '';
      const status = parseStatus(res.ok, res.status, bodyText);
      return { status, httpStatus: res.status };
    } catch (err){
      lastErr = err;
      // only retry on timeout or network-ish
      if (attempt < retries && (err?.code === 'HEALTH_UNAVAILABLE' || String(err?.message||'').includes('timeout'))) {
        continue;
      }
      break;
    }
  }
  const e = new Error('health probe failed');
  e.name = 'PreflightError';
  e.code = 'HEALTH_UNAVAILABLE';
  e.details = lastErr?.details || { reason: lastErr?.message || 'unknown' };
  throw e;
}
