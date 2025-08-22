// lib/events/sink.mjs
// Post run/events to vibe-ui from the user-side runtime (bridge-agent).

function pickBaseUrl(options = {}){
  const base = options.baseUrl || process.env.VIBE_UI_BASE_URL;
  if (!base) throw new Error('VIBE_UI_BASE_URL not configured');
  return base.replace(/\/$/, '');
}

async function callJSON(url, init){
  const res = await fetch(url, { ...init, headers: { 'content-type':'application/json', ...(init?.headers||{}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('vibe-ui error');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function appendEvents({ projectId, runId, events, baseUrl }){
  const b = pickBaseUrl({ baseUrl });
  return await callJSON(`${b}/api/runs/events`, {
    method:'POST',
    body: JSON.stringify({ projectId, runId, events })
  });
}
