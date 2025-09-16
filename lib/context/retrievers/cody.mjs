// Sourcegraph Cody retriever adapter. Optional.
import { env } from '../../util/env.mjs';

function headers() {
  const token = env('CODY_TOKEN', '');
  return {
    'content-type': 'application/json',
    ...(token ? { 'authorization': `token ${token}` } : {}),
  };
}

// retrieve({ query, limitChars }) -> { artifacts: [{path, content}] }
export async function retrieve({ query, limitChars=200000 } = {}) {
  const url = env('CODY_ENDPOINT', '');
  if (!url) throw new Error('CODY_ENDPOINT not set');
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ query, limit: limitChars }),
  });
  if (!res.ok) throw new Error(`CODY_HTTP_${res.status}`);
  const data = await res.json().catch(() => ({}));
  // Expect server to respond with { items: [{ path, content }] }
  const items = Array.isArray(data.items) ? data.items : [];
  const out = [];
  let used = 0;
  for (const it of items) {
    const text = String(it.content || '');
    if (used >= limitChars) break;
    const remain = limitChars - used;
    const slice = text.slice(0, remain);
    out.push({ path: it.path || 'cody', content: slice });
    used += slice.length;
  }
  return { artifacts: out };
}

export default { retrieve };
