
import { requireBridgeGuards, setDisabled } from '../../../lib/security/guard.mjs';

export async function POST(req){
  const gate = await requireBridgeGuards(req, { scope:'bridge.heartbeat', aud:'bridge' });
  if (!gate.ok) return new Response(JSON.stringify(gate.body), { status: gate.status });
  const { request } = gate;
  const body = await request.json().catch(()=> ({}));
  const projectId = String(body.projectId || '');
  const disable = !!body.disable;
  if (!projectId) return new Response(JSON.stringify({ error:'MISSING_PROJECT' }), { status: 400 });
  setDisabled(projectId, disable);
  return new Response(JSON.stringify({ ok:true, disable }), { headers: { 'content-type':'application/json' } });
}
