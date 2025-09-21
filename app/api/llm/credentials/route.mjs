import { guard } from '../../../../lib/security/hmac.guard.mjs';


function json(status, obj){
  return new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json' } });
}


export async function POST(req){
  const g = await guard(req);
  if (g) return json(g.status, g.body);
  let body = {}
  try { body = await req.json(); } catch {}
  const { provider, apiKey, baseUrl } = body || {};
  if (!(provider && apiKey)) return json(400, { ok:false, code:'INVALID_INPUT' });
  try {
    const ks = await import('../../../../lib/keystore/local.mjs');
    await ks.setKey(provider, apiKey);
  } catch {}
  const cfg = await import('../../../../lib/llm/config.mjs');
  await cfg.setConfig({ provider, ...(baseUrl ? { baseUrl } : {}) });
  return json(200, { ok:true });
}
