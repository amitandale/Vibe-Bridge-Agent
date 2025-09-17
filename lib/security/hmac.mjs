// lib/security/hmac.mjs
import crypto from 'node:crypto';

const DEFAULT_GRACE_S = Number.parseInt(process.env.HMAC_ROTATION_GRACE_S || '604800', 10) || 604800;

/**
 * In-memory secret store placeholder.
 * Structure: Map<projectId, { current: {kid, key, created_at}, previous?: {kid, key, rotated_at} }>
 * This will be replaced by DB-backed store in BA-03.
 */
const _store = new Map();

export function _clearStore(){ _store.clear(); }
export function _seed({ projectId, kid, key, now = Date.now() }){
  if (!projectId || !kid || !key) throw new Error('bad seed');
  _store.set(projectId, { current: { kid, key, created_at: Math.floor(now/1000) } });
}
export function _rotate({ projectId, newKid, newKey, now = Date.now() }){
  const s = _store.get(projectId);
  if (!s) throw new Error('project missing');
  const prev = { ...s.current, rotated_at: Math.floor(now/1000) };
  _store.set(projectId, { current: { kid: newKid, key: newKey, created_at: Math.floor(now/1000) }, previous: prev });
}

/**
 * Lookup key material by project and kid with rotation grace.
 * Returns { key, kid, source: 'current'|'previous' } or null.
 */
export function lookupKey(projectId, kid, { now = Date.now(), grace_s = DEFAULT_GRACE_S } = {}){
  const rec = _store.get(projectId);
  if (!rec) return null;
  if (rec.current?.kid === kid) return { key: rec.current.key, kid, source: 'current' };
  if (rec.previous?.kid === kid){
    const age = Math.floor(now/1000) - (rec.previous.rotated_at || Math.floor(now/1000));
    if (age <= grace_s) return { key: rec.previous.key, kid, source: 'previous' };
  }
  return null;
}

/**
 * Compute canonical signature for raw bytes using sha256 HMAC.
 * Returns "sha256=<hex>".
 */
export function sign(rawBuf, key){
  const data = Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf ?? '');
  const h = crypto.createHmac('sha256', key).update(data).digest('hex');
  return 'sha256=' + h;
}

/**
 * Constant-time header compare. Returns boolean.
 */
export function timingSafeEqualStr(a, b){
  try {
    return crypto.timingSafeEqual(Buffer.from(String(a)), Buffer.from(String(b)));
  } catch {
    return false;
  }
}

/**
 * Verify signature for project using provided kid with rotation grace support.
 * Returns { ok, code?, message?, used?: 'current'|'previous' }
 * Codes: ERR_HMAC_MISSING, ERR_HMAC_MISMATCH
 */
export function verifySignature({ projectId, kid, signature, raw }, { now = Date.now(), grace_s = DEFAULT_GRACE_S } = {}){
  if (!projectId || !kid){
    return { ok: false, code: 'ERR_HMAC_MISSING', message: 'project or kid missing' };
  }
  if (!/^sha256=/.test(String(signature || ''))){
    return { ok: false, code: 'ERR_HMAC_MISMATCH', message: 'unsupported or missing algorithm' };
  }
  const hit = lookupKey(projectId, kid, { now, grace_s });
  if (!hit){
    return { ok: false, code: 'ERR_HMAC_MISSING', message: 'no active key for project' };
  }
  const expected = sign(raw, hit.key);
  const ok = timingSafeEqualStr(expected, signature);
  return ok ? { ok: true, used: hit.source } : { ok: false, code: 'ERR_HMAC_MISMATCH', message: 'signature mismatch' };
}

/**
 * Express/Next-compatible middleware factory.
 * Reads headers: x-vibe-project, x-vibe-kid, x-signature.
 * Attaches req.vibe.hmac = { projectId, kid, used }
 */
export function requireHmac({ rawBodyReader, env = process.env } = {}){
  const grace_s = Number.parseInt(env.HMAC_ROTATION_GRACE_S || String(DEFAULT_GRACE_S), 10) || DEFAULT_GRACE_S;
  const readRaw = rawBodyReader || (async (req) => {
    const { readRawBody } = await import('./rawBody.mjs');
    return await readRawBody(req);
  });
  return async function hmacMiddleware(req, res, next){
    try {
      const headers = req?.headers || {};
      const projectId = headers['x-vibe-project'] || headers['X-Vibe-Project'] || headers.get?.('x-vibe-project');
      const kid = headers['x-vibe-kid'] || headers['X-Vibe-Kid'] || headers.get?.('x-vibe-kid');
      const sig = headers['x-signature'] || headers['X-Signature'] || headers.get?.('x-signature');
      const raw = await readRaw(req);
      const v = verifySignature({ projectId, kid, signature: sig, raw }, { grace_s });
      if (!v.ok){
        if (res){
          res.statusCode = (v.code === 'ERR_HMAC_MISSING') ? 401 : 403;
          try { res.setHeader && res.setHeader('content-type','application/json'); } catch {}
          try { res.end && res.end(JSON.stringify({ error: { code: v.code, message: v.message } })); } catch {}
          return;
        }
        return;
      }
      req.vibe = Object.assign({}, req.vibe, { projectId, hmac: { kid, used: v.used } });
      if (typeof next === 'function') return next();
      return;
    } catch (e){
      if (res){
        res.statusCode = 500;
        try { res.setHeader && res.setHeader('content-type','application/json'); } catch {}
        try { res.end && res.end(JSON.stringify({ error: { code: 'ERR_INTERNAL', message: 'internal error' } })); } catch {}
      }
    }
  };
}

// --- Provider DI hook for BA-02 evolution ---
// Allows plugging a different secrets provider without breaking current API.
// Provider must implement:
//   async listByProject(projectId) -> [{ kid, key, active, rotated_at, created_at }]
//   async getByKid(kid) -> { kid, key, active, rotated_at, created_at }
let __secretsProvider = null;
export function setSecretsProvider(p){
  __secretsProvider = p;
}
export async function lookupKey({ projectId, kid, now = Date.now() }){
  // If DI provider set, use it. Otherwise fall back to in-memory store via existing helpers.
  if (__secretsProvider){
    const list = await __secretsProvider.listByProject(projectId);
    if (!Array.isArray(list) || list.length === 0) return { ok:false, code:'NO_ACTIVE_KEY' };
    // Prefer exact kid match when present
    const cur = list.find(r => r.kid === kid && r.active) || list.find(r => r.active);
    const prev = list.filter(r => r.kid !== (cur && cur.kid)).sort((a,b)=> (b.rotated_at||0)-(a.rotated_at||0))[0];
    return { ok:true, current: cur && { kid: cur.kid, key: cur.value || cur.key, created_at: cur.created_at }, previous: prev && { kid: prev.kid, key: prev.value || prev.key, rotated_at: prev.rotated_at } };
  }
  // Compatibility with current in-memory store API
  try {
    const v = verifySignature({ projectId, kid, signature: 'sha256=' + '0'*64, raw: Buffer.alloc(0), now });
    if (v.ok){
      // Not exposing secret on purpose. Return shape only for tests that call lookupKey.
      return { ok:true, current: { kid }, previous: v.used==='previous' ? { kid:'prev' } : undefined };
    }
  } catch {}
  return { ok:false, code:'NO_ACTIVE_KEY' };
}
