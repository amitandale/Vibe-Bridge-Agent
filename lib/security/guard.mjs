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

function parseScopes(val){
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return val.split(/[\s,]+/).filter(Boolean);
  return [];
}

export const requireBridgeGuards = requireBridgeGuardsBool;
export const isAllowed = requireBridgeGuardsBool;
export const gate      = requireBridgeGuardsBool;
export const allowed   = requireBridgeGuardsBool;

function requireBridgeGuardsBool(){ return !DISABLED; }

import { verifyJwt } from './jwt.mjs';
import { NonceCache } from './nonceCache.mjs';
import * as projects from '../repo/projects.mjs';

/**
 * requireTicket(requiredScopes: string[], opts?: { env?: Record<string,string> })
 * Headers:
 *   x-vibe-ticket: Bearer <jwt> OR raw <jwt>
 *   x-vibe-project: <project_id>
 */
export function requireTicket(requiredScopes = [], opts = {}){
  const env = { ...(process?.env ?? {}), ...(opts.env ?? {}) };
  const jwksUrl = env.VIBE_JWKS_URL;
  const aud = env.VIBE_TICKET_AUD;
  const iss = env.VIBE_TICKET_ISS;
  const enforce = String(env.GUARD_ENFORCE || 'false') === 'true';

  const nonceCache = new NonceCache({ ttlDefaultS: 15 * 60 }); // 15 min default

  return async function ticketMiddleware(req, res, next){
    // Bypass if globally disabled
    if (DISABLED) { if (typeof next === 'function') return next(); return; }

    const projectId = getHeaderLike(req, 'x-vibe-project') || getHeaderLike(req, 'x-project-id') || getHeaderLike(req, 'x-project');
    const tokenHdr  = getHeaderLike(req, 'x-vibe-ticket') || getHeaderLike(req, 'authorization');
    const token = String(tokenHdr || '').replace(/^Bearer\s+/i, '');

    function deny(code, msg){
      if (!enforce) { if (typeof next === 'function') return next(); return; }
      try { res.statusCode = code; } catch {}
      try { res.setHeader('content-type', 'text/plain; charset=utf-8'); } catch {}
      try { res.end(String(msg)); } catch {}
    }

    if (!token) return deny(401, 'missing token');
    if (!projectId) return deny(401, 'missing project');

    try {
      const { payload } = await verifyJwt(token, { jwksUrl, aud, iss, clockSkewS: Number(env.VIBE_JWT_SKEW_S || 120) });
      // Audience and issuer are checked by verifyJwt
      // Scopes
      const scopes = parseScopes(payload.scope || payload.scopes);
      const missing = requiredScopes.filter(s => !scopes.includes(s));
      if (missing.length) return deny(403, 'insufficient scope');

      // Replay protection using jti
      const jti = payload.jti || payload.nonce || null;
      if (jti){
        const ok = await nonceCache.insertIfAbsent(String(jti), { purpose: 'ticket', ttlS: Number(env.VIBE_TICKET_TTL_S || 600) });
        if (!ok) return deny(409, 'replay detected');
      }

      // Disabled project check
      try {
        const row = projects.get(String(projectId));
        if (row && Number(row.disabled) === 1) return deny(403, 'project disabled');
      } catch {}

      // Attach context and continue
      req.vibe = Object.assign({}, req.vibe || {}, { projectId, token, scopes });
      if (typeof next === 'function') return next();
    } catch (e){
      return deny(401, e && e.message ? e.message : 'invalid token');
    }
  };
}

// HMAC guard added by PR-BA-02
export { requireHmac } from './hmac.mjs';
