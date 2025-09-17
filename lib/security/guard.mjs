// lib/security/guard.mjs
// Compatibility guard + BA-01 ticket middleware.
// - requireBridgeGuards: synchronous, legacy shape for tests (presence + global disable)
// - requireTicket: async, full JWT verify + scope + jti replay + per-project disable

import { verifyJwt } from './jwt.mjs';
import { insertIfAbsent as nonceInsertIfAbsent } from '../repo/nonces.mjs';
import * as ProjectsDisable from '../projects/disable.mjs';
import { Codes, httpError } from '../obs/errors.mjs';

let DISABLED = false;
export function setDisabled(v = true){ DISABLED = !!v; }
export function isDisabled(){ return DISABLED; }
export function enable(){ setDisabled(false); }
export function disable(){ setDisabled(true); }
export function reset(){ setDisabled(false); }

function headerGet(reqOrHeaders, name){
  const h = reqOrHeaders?.headers ?? reqOrHeaders;
  if (!h) return undefined;
  try { if (typeof h.get === 'function') return h.get(name); } catch {}
  const lname = String(name).toLowerCase();
  for (const [k,v] of Object.entries(h||{})) if (String(k).toLowerCase() === lname) return v;
  return undefined;
}

function readLegacySignature(req){
  return headerGet(req, 'x-signature') || headerGet(req, 'x-bridge-signature') || '';
}
function readLegacyTicket(req){
  const auth = headerGet(req, 'authorization') || headerGet(req, 'Authorization') || '';
  if (auth && /^bearer\s+/i.test(auth)) return String(auth).slice(auth.indexOf(' ')+1).trim();
  return headerGet(req, 'x-vibe-ticket') || headerGet(req, 'x-ticket') || '';
}

/**
 * Legacy synchronous guard for unit tests and simple routes.
 * Returns { ok, code?, status?, body?, request? }
 */
export function requireBridgeGuards(req, _opts = {}){
  const sig = readLegacySignature(req);
  if (!sig) return { ok:false, code:'MISSING_SIGNATURE', status:401, body:{ error:{ code:'MISSING_SIGNATURE' } } };
  const ticket = readLegacyTicket(req);
  if (!ticket) return { ok:false, code:'MISSING_TICKET', status:401, body:{ error:{ code:'MISSING_TICKET' } } };
  if (DISABLED) return { ok:false, code:'DISABLED', status:403, body:{ error:{ code:'DISABLED' } } };
  return { ok:true, request: req };
}

function normalizeScopes(s){
  if (!s) return [];
  if (Array.isArray(s)) return s.map(String);
  const str = String(s);
  if (str.includes(' ')) return str.split(/\s+/).filter(Boolean);
  if (str.includes(',')) return str.split(/\s*,\s*/).filter(Boolean);
  return [str];
}
function hasAllScopes(payloadScopes, required){
  const have = new Set(normalizeScopes(payloadScopes));
  for (const r of normalizeScopes(required)) if (!have.has(r)) return false;
  return true;
}

function resolveOpts(opts){
  return {
    jwksUrl: opts?.jwksUrl || process.env.VIBE_JWKS_URL,
    aud:     opts?.aud     || process.env.VIBE_JWT_AUD || 'bridge',
    iss:     opts?.iss     || process.env.VIBE_JWT_ISS || undefined,
    clockSkewS: Number.isFinite(opts?.clockSkewS) ? Number(opts.clockSkewS) : 90,
  };
}

// Async, full BA-01 verification for privileged routes
export async function requireBridgeGuardsAsync(req, opts = {}){
  try {
    if (DISABLED) return { ok:false, ...httpError(Codes.ERR_PROJECT_DISABLED, 'disabled', 403) };
    const ticket = readLegacyTicket(req);
    if (!ticket) return { ok:false, ...httpError(Codes.ERR_JWT_INVALID, 'missing ticket', 401) };

    const ropts = resolveOpts(opts);
    const { payload } = await verifyJwt(ticket, ropts);

    // Per-project disable
    const projectId = String(payload.sub || '');
    if (projectId) {
      const disabled = await ProjectsDisable.isDisabled(projectId);
      if (disabled) return { ok:false, ...httpError(Codes.ERR_PROJECT_DISABLED, 'project disabled', 403) };
    }

    // Scope check
    const requiredScope = opts.scope || opts.scopes || [];
    if (requiredScope && !hasAllScopes(payload.scope, requiredScope)){
      const err = httpError(Codes.ERR_JWT_SCOPE, 'scope denied', 403, { need: normalizeScopes(requiredScope) });
      err.body.error.code = Codes.ERR_JWT_SCOPE;
      return { ok:false, ...err };
    }

    // Replay guard via jti
    const jti = String(payload.jti || '');
    if (jti){
      const now = Math.floor(Date.now()/1000);
      const exp = Number(payload.exp || 0);
      let ttl = exp ? Math.max(0, exp - now + (ropts.clockSkewS||0)) : 3600;
      ttl = Math.max(60, Math.min(ttl, 86400));
      const ok = nonceInsertIfAbsent(jti, { purpose:'ticket', ttl_s: ttl });
      if (ok === false) return { ok:false, ...httpError(Codes.ERR_REPLAY, 'replay detected', 409) };
    }

    return { ok:true, request: req, claims: payload };
  } catch (e){
    return { ok:false, ...httpError(Codes.ERR_JWT_INVALID, e?.message || 'invalid ticket', 401) };
  }
}

// Express-style middleware for servers
export function requireTicket(requiredScopes = [], opts = {}){
  const o = { ...(opts||{}), scope: requiredScopes };
  return async function ticketMiddleware(req, res, next){
    const r = await requireBridgeGuardsAsync(req, o);
    if (!r.ok){
      const body = JSON.stringify(r.body || { error: { code: 'ERR_JWT_INVALID' } });
      res?.status?.(r.status || 401);
      res?.set?.('content-type','application/json; charset=utf-8');
      res?.send?.(body);
      return;
    }
    if (typeof next === 'function') next();
  };
}

export const gate = requireBridgeGuards;
export const allowed = (req, opts) => requireBridgeGuards(req, opts)?.ok === true;

// HMAC guard passthrough (BA-02)
export { requireHmac } from './hmac.mjs';
