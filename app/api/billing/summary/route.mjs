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
  const provider = url.searchParams.get('provider') || process.env.LLM_PROVIDER || 'perplexity';
  const model = url.searchParams.get('model') || process.env.LLM_MODEL || 'pplx-7b-chat';
  const estIn = Number(url.searchParams.get('estIn') || 0);
  const ef = await import('../../../../lib/billing/enforce.mjs');
  const summary = await ef.checkBudget({ projectId, prId, provider, model, estimate: { inputTokens: estIn, outputTokens: 0 } });
  return json(200, { ok:true, summary });
}
