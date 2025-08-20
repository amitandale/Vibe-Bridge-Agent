
import crypto from 'node:crypto';

const disableMap = new Map(); // projectId -> boolean
export function setDisabled(projectId, disabled){ disableMap.set(String(projectId), !!disabled); }
export function isDisabled(projectId){ return !!disableMap.get(String(projectId)); }

function b64urlToBuf(s){
  s = s.replace(/-/g,'+').replace(/_/g,'/'); const pad = s.length % 4; if (pad) s += '='.repeat(4-pad);
  return Buffer.from(s, 'base64');
}

let jwksCache = { ts:0, keys:[] };
async function getJwks(){
  const base = process.env.VIBE_CI_URL || process.env.CI_BASE_URL || '';
  const url = base ? `${base.replace(/\/$/,'')}/.well-known/jwks.json` : null;
  if (!url) throw new Error('MISSING_JWKS_URL');
  const now = Date.now();
  if (now - jwksCache.ts < 60_000 && jwksCache.keys?.length) return jwksCache;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  jwksCache = { ts: now, keys: data.keys || [] };
  return jwksCache;
}

function importRsaPublicKey(n_b64, e_b64){
  const jwk = { kty:'RSA', n: n_b64, e: e_b64 };
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

function verifySignature(headerB64, payloadB64, sigB64, pubKey){
  const data = Buffer.from(headerB64 + '.' + payloadB64);
  const sig = b64urlToBuf(sigB64);
  const v = crypto.createVerify('RSA-SHA256');
  v.update(data); v.end();
  return v.verify(pubKey, sig);
}

function nowSec(){ return Math.floor(Date.now()/1000); }

export async function verifyTicket(token, { scope, aud }){
  const parts = String(token||'').split('.');
  if (parts.length !== 3) throw new Error('TOKEN_FORMAT');
  const [h, p, s] = parts;
  const header = JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
  const payload = JSON.parse(Buffer.from(p, 'base64').toString('utf8'));
  if (payload.exp <= nowSec()) throw new Error('EXPIRED');
  if (payload.aud !== aud) throw new Error('AUD_MISMATCH');
  const scopes = Array.isArray(payload.scope) ? payload.scope : [payload.scope];
  const required = Array.isArray(scope) ? scope : [scope];
  for (const sc of required) if (!scopes.includes(sc)) throw new Error('SCOPE_MISMATCH');
  const { keys } = await getJwks();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('KID_NOT_FOUND');
  const pub = importRsaPublicKey(jwk.n, jwk.e);
  const ok = verifySignature(h, p, s, pub);
  if (!ok) throw new Error('BAD_SIGNATURE');
  return { ok:true, payload };
}

export function verifyHmac(raw, sig, secret){
  if (!secret) return false;
  const h = crypto.createHmac('sha256', secret); h.update(raw);
  const expected = 'sha256=' + h.digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig||'')); } catch { return false; }
}

export async function requireBridgeGuards(req, { scope, aud='ci' }){
  const raw = await req.text();
  if (!verifyHmac(raw, req.headers.get('x-signature'), process.env.BRIDGE_SECRET)) {
    return { ok:false, status:401, body:{ error:'SIGNATURE_INVALID' } };
  }
  const token = req.headers.get('x-vibe-ticket') || (req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if (!token) return { ok:false, status:401, body:{ error:'MISSING_TICKET' } };
  try {
    await verifyTicket(token, { scope, aud });
  } catch (e) {
    return { ok:false, status:401, body:{ error:String(e.message||'TICKET_INVALID') } };
  }
  const clone = new Request(req.url, { method:req.method, headers:req.headers, body:raw });
  return { ok:true, request: clone, raw };
}
