// lib/security/guard.mjs
import { verifyJwt } from './jwt.mjs';
import { insertIfAbsent as nonceInsertIfAbsent } from '../repo/nonces.mjs';
import * as ProjectsDisable from '../projects/disable.mjs';
import { Codes, httpError } from '../obs/errors.mjs';

function headerGet(reqOrHeaders, name){
  const h = reqOrHeaders?.headers ?? reqOrHeaders;
  if (!h) return undefined;
  try { if (typeof h.get === 'function') return h.get(name); } catch {}
  const lname = String(name).toLowerCase();
  for (const [k,v] of Object.entries(h)) if (String(k).toLowerCase() === lname) return v;
  return undefined;
}

function readTicket(req){
  const auth = headerGet(req, 'authorization') || headerGet(req, 'Authorization') || '';
  if (auth && /^bearer\s+/i.test(auth)) return String(auth).slice(auth.indexOf(' ')+1).trim();
  return headerGet(req, 'x-ticket') || headerGet(req, 'X-Ticket') || '';
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

export async function requireBridgeGuards(req, opts = {}){
  try {
    const token = readTicket(req);
    if (!token) return { ok:false, ...httpError(Codes.ERR_JWT_INVALID, 'missing ticket', 401) };

    const ropts = resolveOpts(opts);
    const { payload } = await verifyJwt(token, ropts);

    // Project disable check
    const projectId = String(payload.sub || '');
    if (projectId) {
      const disabled = await ProjectsDisable.isDisabled(projectId);
      if (disabled) return { ok:false, ...httpError(Codes.ERR_PROJECT_DISABLED, 'project disabled', 403) };
    }

    // Scope check
    const requiredScope = opts.scope || opts.scopes || [];
    if (requiredScope && !hasAllScopes(payload.scope, requiredScope)){
      return { ok:false, ...httpError(Codes.ERR_JWT_SCOPE, 'scope denied', 403, { need: normalizeScopes(requiredScope) }) };
    }

    // Replay guard via jti
    const jti = String(payload.jti || '');
    if (jti){
      // TTL: clamp 1min..1day, prefer remaining validity if exp present
      const now = Math.floor(Date.now()/1000);
      const exp = Number(payload.exp || 0);
      let ttl = exp ? Math.max(0, exp - now + (ropts.clockSkewS||0)) : 3600;
      ttl = Math.max(60, Math.min(ttl, 86400));
      const ok = nonceInsertIfAbsent(jti, { purpose:'ticket', ttl_s: ttl });
      if (ok === false) return { ok:false, ...httpError(Codes.ERR_REPLAY, 'replay detected', 409) };
    }

    // Pass through
    return { ok:true, request: req, claims: payload };
  } catch (e){
    return { ok:false, ...httpError(Codes.ERR_JWT_INVALID, e?.message || 'invalid ticket', 401) };
  }
}

export async function requireBridgeGuardsBool(req, opts = {}){
  const r = await requireBridgeGuards(req, opts);
  return !!r.ok;
}

export const isAllowed = requireBridgeGuardsBool;
export const gate      = requireBridgeGuardsBool;
export const allowed   = requireBridgeGuardsBool;

// Express-style middleware variant
export function requireTicket(requiredScopes = [], opts = {}){
  const o = { ...(opts||{}), scope: requiredScopes };
  return async function ticketMiddleware(req, res, next){
    const r = await requireBridgeGuards(req, o);
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

// HMAC guard passthrough (BA-02)
export { requireHmac } from './hmac.mjs';
