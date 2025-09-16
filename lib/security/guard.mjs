// lib/security/guard.mjs
let DISABLED = false;

export function setDisabled(v = true){ DISABLED = !!v; }
export function isDisabled(){ return DISABLED; }
export function enable(){ setDisabled(false); }
export function disable(){ setDisabled(true); }
export function reset(){ setDisabled(false); }

function getHeaderLike(reqOrHeaders, name){
  const headers = reqOrHeaders?.headers ?? reqOrHeaders;
  if (!headers) return undefined;
  try { if (typeof headers.get === 'function') return headers.get(name); } catch {}
  const lname = String(name).toLowerCase();
  for (const [k,v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === lname) return v;
  }
  return undefined;
}

export function requireBridgeGuards(req){
  const sig = getHeaderLike(req, 'x-signature');
  const ticket = getHeaderLike(req, 'x-vibe-ticket');
  // Precedence: missing auth headers first
  if (!sig)    return { ok:false, status:401, code:'MISSING_SIGNATURE' };
  if (!ticket) return { ok:false, status:401, code:'MISSING_TICKET' };
  // Then global disable
  if (DISABLED) return { ok:false, status:403, code:'DISABLED' };
  return { ok:true };
}

export function requireBridgeGuardsBool(req){
  return !!requireBridgeGuards(req).ok;
}

export const isAllowed = requireBridgeGuardsBool;
export const gate      = requireBridgeGuardsBool;
export const allowed   = requireBridgeGuardsBool;

export function requireTicket(requiredScopes = [], opts = {}){
  return async function ticketMiddleware(req, res, next){
    if (typeof next === 'function') next();
  };
}

// HMAC guard added by PR-BA-02
export { requireHmac } from './hmac.mjs';
