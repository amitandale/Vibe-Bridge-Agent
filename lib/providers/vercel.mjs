// lib/providers/vercel.mjs
// Test-safe sleep: do NOT unref().
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mapError(status, body){
  if (status === 401 || status === 403) return { code:'PROVIDER_FORBIDDEN', status, message: body?.message || 'forbidden' };
  if (status === 429) return { code:'PROVIDER_RATE_LIMIT', status, message: 'rate limited' };
  if (status >= 500) return { code:'PROVIDER_RETRY', status, message: 'server error' };
  return { code:'PROVIDER_ERROR', status, message: body?.message || 'provider error' };
}

export async function deploy({ repo, framework, fetchImpl = globalThis.fetch }){
  const res = await fetchImpl('https://api.vercel.example/deploy', { method:'POST', body: JSON.stringify({ repo, framework }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw mapError(res.status, body);
  return { id: body.id || 'deploy_123' };
}

export async function status({ id, fetchImpl = globalThis.fetch, maxAttempts = 5, backoffMs = 50 }){
  for (let attempt = 1; attempt <= maxAttempts; attempt++){
    try {
      const res = await fetchImpl(`https://api.vercel.example/deploy/${id}/status`);
      const body = await res.json().catch(() => ({}));
      if (res.ok){
        const state = body.state || (body.ready ? 'READY' : 'PENDING');
        const ready = body.ready === true || state === 'READY' || state === 'SUCCEEDED';
        if (ready) return { state, ready: true };
      } else {
        const err = mapError(res.status, body);
        if (err.code === 'PROVIDER_RETRY' || err.code === 'PROVIDER_RATE_LIMIT'){
          // retry
        } else {
          throw err;
        }
      }
    } catch (e){
      if (attempt >= maxAttempts) throw e;
    }
    await sleep(backoffMs * attempt);
  }
  return { state: 'TIMEOUT', ready: false };
}

export async function previewUrl({ id, fetchImpl = globalThis.fetch }){
  const res = await fetchImpl(`https://api.vercel.example/deploy/${id}/preview`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw mapError(res.status, body);
  return { url: body.url || 'https://preview.example.vercel.app' };
}
