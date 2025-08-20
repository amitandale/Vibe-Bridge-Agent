
// Heartbeat route (test mirror). Accepts header OR JSON body to toggle disable.
// Guards: require signature + ticket; fail-closed.
import { requireBridgeGuards, setDisabled } from '../security/guard.mjs';

function parseBoolean(v){
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === '1' || s === 'true') return true;
  if (s === '0' || s === 'false') return false;
  return null;
}

export async function POST(req){
  const g = requireBridgeGuards(req);
  if (!g.ok) {
    return new Response(JSON.stringify({ ok:false, code: g.code }), {
      status: g.status||401,
      headers:{'content-type':'application/json'}
    });
  }

  // 1) Header wins if present
  const hv = parseBoolean(req.headers.get('x-vibe-disable'));
  let disable = hv;

  // 2) Otherwise look at JSON body: { disable: true|false }
  if (disable === null) {
    try {
      const body = await req.json();
      const bv = (body && typeof body.disable !== 'undefined') ? parseBoolean(body.disable) : null;
      if (bv !== null) disable = bv;
    } catch { /* no body or not json */ }
  }

  // 3) Default when nothing provided
  if (disable === null) disable = false;

  setDisabled(!!disable);

  return new Response(JSON.stringify({ ok:true, disable: !!disable }), {
    status: 200,
    headers:{'content-type':'application/json'}
  });
}
