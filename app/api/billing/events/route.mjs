import { guard } from '../../../../lib/security/hmac.guard.mjs';

function json(status, obj){
  return new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json' } });
}

async function readEventsFromFile(prId, limit){
  try {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (!home) return [];
    const path = `${home}/.vibe/billing/usage.ndjson`;
    const fs = await import('node:fs/promises');
    const exists = await fs.access(path).then(()=>true).catch(()=>false);
    if (!exists) return [];
    const data = await fs.readFile(path, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    const objs = [];
    for (let i = lines.length - 1; i >= 0 && objs.length < limit; i--){
      try {
        const obj = JSON.parse(lines[i]);
        if (prId && obj.prId && obj.prId !== prId) continue;
        objs.push(obj);
      } catch {}
    }
    return objs;
  } catch {
    return [];
  }
}

export async function GET(req){
  const g = await guard(req);
  if (g) return json(g.status, g.body);
  const url = new URL(req.url);
  const prId = url.searchParams.get('prId') || null;
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 50)));
  // Prefer store.mjs if available
  try {
    const st = await import('../../../../lib/billing/store.mjs');
    if (st && typeof st.listUsageEvents === 'function'){
      const list = await st.listUsageEvents({ prId, limit });
      return json(200, { ok:true, events: Array.isArray(list) ? list : [] });
    }
  } catch {}
  // Fallback to local file reader
  const fallback = await readEventsFromFile(prId, limit);
  return json(200, { ok:true, events: fallback });
}
