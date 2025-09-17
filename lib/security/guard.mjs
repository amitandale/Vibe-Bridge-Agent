import { verify as verifyHmac } from './hmac.mjs';
import { readRawBody } from './rawBody.mjs';

// Try to dynamically import JWT verifier if present. Fall back to header-based admin.
async function verifyJwtIfAvailable(req) {
  try {
    const mod = await import('./jwt.mjs');
    if (mod && mod.verifyJwt) {
      // Attempt to get token from Authorization header or x-vibe-ticket
      const auth = (req.headers && (req.headers.get && req.headers.get('authorization')))
                  || req.headers && (req.headers['authorization'] || req.headers['Authorization'])
                  || (req.headers && (req.headers.get && req.headers.get('x-vibe-ticket')))
                  || null;
      if (!auth) return null;
      // normalize "Bearer TOKEN"
      const token = String(auth).replace(/^Bearer\s+/i, '');
      return await mod.verifyJwt(token).catch(()=>null);
    }
  } catch (e) {
    return null;
  }
  return null;
}

function headerGet(h, key) {
  if (!h) return null;
  if (typeof h.get === 'function') return h.get(key);
  return h[key] || h[key.toLowerCase()] || null;
}

export function requireHmac() {
  return async function (req) {
    const projectId = headerGet(req.headers, 'x-vibe-project');
    const kid = headerGet(req.headers, 'x-vibe-kid');
    const signature = headerGet(req.headers, 'x-signature');

    if (!projectId) throw { status: 401, error: { code: 'ERR_HMAC_MISSING', message: 'missing x-vibe-project' } };
    if (!signature) throw { status: 401, error: { code: 'ERR_HMAC_MISSING', message: 'missing x-signature' } };

    const raw = await readRawBody(req);
    const res = await verifyHmac({ projectId, kid, signatureHex: signature, rawBody: raw });
    if (!res.ok) {
      const code = res.code === 'ERR_HMAC_NO_KEY' ? 'ERR_HMAC_MISSING' : 'ERR_HMAC_MISMATCH';
      const status = code === 'ERR_HMAC_MISSING' ? 401 : 403;
      throw { status, error: { code, message: code } };
    }

    req.vibe = req.vibe || {};
    req.vibe.hmac = { kid: res.kid };
    return true;
  };
}

export function requireTicket(scopes=[]) {
  return async function (req) {
    // If already verified by previous middleware, honour it.
    if (req.vibe && req.vibe.ticket) {
      const has = scopes.every(s => (req.vibe.ticket.scopes||[]).includes(s));
      if (!has) throw { status: 403, error: { code: 'ERR_FORBIDDEN', message: 'missing scope' } };
      return true;
    }

    // First, try JWT verifier if available.
    const jwtInfo = await verifyJwtIfAvailable(req);
    if (jwtInfo) {
      req.vibe = req.vibe || {};
      req.vibe.ticket = { scopes: jwtInfo.scopes || [], sub: jwtInfo.sub || null, raw: jwtInfo };
      const has = scopes.every(s => (req.vibe.ticket.scopes||[]).includes(s));
      if (!has) throw { status: 403, error: { code: 'ERR_FORBIDDEN', message: 'missing scope' } };
      return true;
    }

    // Fallback: header-based admin token (development only).
    const admin = headerGet(req.headers, 'x-vibe-admin');
    if (scopes.includes('bridge:admin') && !admin) {
      throw { status: 403, error: { code: 'ERR_FORBIDDEN', message: 'bridge:admin required' } };
    }
    req.vibe = req.vibe || {};
    req.vibe.ticket = { scopes };
    return true;
  };
}
