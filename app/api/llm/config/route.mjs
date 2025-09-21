import { guard } from '../../../../lib/security/hmac.guard.mjs';


function json(status, obj){
  return new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json' } });
}

export async function GET(req){
  const g = await guard(req);
  if (g) return json(g.status, g.body);
  const cfg = await import('../../../../lib/llm/config.mjs');
  const out = await cfg.getConfig();
  return json(200, { ok:true, config: out });
}
