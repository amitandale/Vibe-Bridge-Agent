\
// lib/providers/vercel.mjs
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function mapError(status, body){
  if (status === 401 || status === 403) return { code:'PROVIDER_FORBIDDEN', status, message: body?.message || 'forbidden' };
  if (status === 429) return { code:'PROVIDER_RATE_LIMIT', status, message: 'rate limited' };
  if (status >= 500) return { code:'PROVIDER_RETRY', status, message: 'server error' };
  return { code:'PROVIDER_ERROR', status, message: body?.message || 'provider error' };
}

export async function deploy({ repo, framework, fetchImpl = globalThis.fetch }){
  const res = await fetchImpl('https://api.vercel.example/deploy', {
    method:'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repo, framework })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw mapError(res.status, body);
  return { id: body.id || 'deploy_123' };
}

export async function status({ id, fetchImpl = globalThis.fetch, maxAttempts=5, backoffMs=200 }){
  for (let attempt=1; attempt<=maxAttempts; attempt++){
    try {
      const res = await fetchImpl('https://api.vercel.example/status', { method:'GET' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw mapError(res.status, body);
      const state = body.state || 'READY';
      const ready = state === 'READY';
      return { state, ready };
    } catch (err) {
      // Allow retry on provider-retry and rate-limit
      if (err && (err.code === 'PROVIDER_RETRY' || err.code === 'PROVIDER_RATE_LIMIT')) {
        await sleep(backoffMs * attempt);
        continue;
      }
      throw err;
    }
  }
  return { state: 'TIMEOUT', ready: false };
}

export async function previewUrl({ id, fetchImpl = globalThis.fetch }){
  const res = await fetchImpl('https://api.vercel.example/preview', { method:'GET' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw mapError(res.status, body);
  return { url: body.url || 'https://preview.example.vercel.app' };
}
