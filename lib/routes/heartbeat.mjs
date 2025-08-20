
// Heartbeat route (test mirror). No body parsing; headers-only.
import { requireBridgeGuards, setDisabled } from '../security/guard.mjs';

export async function POST(req){
  // Fail-closed if guards fail
  const g = requireBridgeGuards(req);
  if (!g.ok) return new Response(JSON.stringify({ ok:false, code: g.code }), { status: g.status||401, headers:{'content-type':'application/json'} });
  // Accept control flag in header (simulating CI response)
  const flag = String(req.headers.get('x-vibe-disable')||'0').trim();
  if (flag === '1' || flag.toLowerCase() === 'true') setDisabled(true);
  else setDisabled(false);
  return new Response(JSON.stringify({ ok:true }), { status: 200, headers:{'content-type':'application/json'} });
}
