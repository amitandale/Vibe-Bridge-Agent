
// Heartbeat route (test mirror). No body parsing; headers-only.
// Returns { ok:true, disable:<bool> } to satisfy tests.
import { requireBridgeGuards, setDisabled } from '../security/guard.mjs';

export async function POST(req){
  const g = requireBridgeGuards(req);
  if (!g.ok) {
    return new Response(JSON.stringify({ ok:false, code: g.code }), {
      status: g.status||401,
      headers:{'content-type':'application/json'}
    });
  }
  const raw = req.headers.get('x-vibe-disable');
  let disable = false;
  if (raw !== null) {
    const v = String(raw).trim().toLowerCase();
    disable = (v === '1' || v === 'true');
    setDisabled(disable);
  }
  return new Response(JSON.stringify({ ok:true, disable }), {
    status: 200,
    headers:{'content-type':'application/json'}
  });
}
