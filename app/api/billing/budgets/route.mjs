import { guard } from '../../../../lib/security/hmac.guard.mjs';


function json(status, obj){
  return new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json' } });
}


export async function GET(req){
  const g = await guard(req);
  if (g) return json(g.status, g.body);
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');
  const prId = url.searchParams.get('prId');
  try {
    const st = await import('../../../../lib/billing/store.mjs');
    let list = await st.loadBudgets();
    if (projectId) list = list.filter(b => b.scope==='project' && b.scopeId===projectId);
    if (prId) list = list.filter(b => b.scope==='pr' && b.scopeId===prId);
    return json(200, { ok:true, budgets: list });
  } catch {
    return json(200, { ok:true, budgets: [] });
  }
}

export async function POST(req){
  const g = await guard(req);
  if (g) return json(g.status, g.body);
  let body = {}
  try { body = await req.json(); } catch {}
  const items = Array.isArray(body) ? body : [body];
  try {
    const st = await import('../../../../lib/billing/store.mjs');
    const out = [];
    for (const b of items) out.push(await st.upsertBudget(b));
    return json(200, { ok:true, budgets: out });
  } catch {
    return json(500, { ok:false, code:'STORE_IO_ERROR' });
  }
}
