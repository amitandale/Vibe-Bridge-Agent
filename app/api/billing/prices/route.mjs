import { guard } from '../../../../lib/security/hmac.guard.mjs';


function json(status, obj){
  return new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json' } });
}

export async function GET(req){
  const g = await guard(req);
  if (g) return json(g.status, g.body);
  try {
    const pr = await import('../../../../lib/billing/prices.mjs');
    const list = pr.listPrices ? pr.listPrices() : [];
    return json(200, { ok:true, prices: list || [] });
  } catch {
    return json(200, { ok:true, prices: [] });
  }
}
