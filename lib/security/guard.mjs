
// Minimal security guard used by tests.
// In production, routes should import and use these guards.
let disabled = false;
export function setDisabled(v){ disabled = !!v; }

export function requireBridgeGuards(req){
  if (disabled) return { ok:false, status: 403, code:'DISABLED' };
  const sig = req.headers.get('x-signature');
  const ticket = req.headers.get('x-vibe-ticket');
  if (!sig) return { ok:false, status: 401, code:'MISSING_SIGNATURE' };
  if (!ticket) return { ok:false, status: 401, code:'MISSING_TICKET' };
  return { ok:true };
}
