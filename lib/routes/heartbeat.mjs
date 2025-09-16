// lib/routes/heartbeat.mjs
// POST toggles fail-closed switch via { disable: boolean } or header x-bridge-disable.
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
  if (!g.ok){
    return new Response(JSON.stringify({ ok:false, code:g.code }), {
      status: g.status || 401,
      headers: { 'content-type':'application/json' }
    });
  }

  // Prefer JSON body, then header. Default false.
  let disable = null;

  // Body
  try {
    const contentType = req.headers?.get?.('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const bv = (body && typeof body.disable !== 'undefined') ? parseBoolean(body.disable) : null;
      if (bv !== null) disable = bv;
    }
  } catch { /* ignore parse errors */ }

  // Header
  if (disable === null){
    const hv = parseBoolean(req.headers?.get?.('x-bridge-disable'));
    if (hv !== null) disable = hv;
  }

  if (disable === null) disable = false;

  setDisabled(!!disable);
  return new Response(JSON.stringify({ ok:true, disable: !!disable }), {
    status: 200,
    headers: { 'content-type':'application/json' }
  });
}
