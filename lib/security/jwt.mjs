// lib/security/jwt.mjs
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const DEBUG = (globalThis.process && process.env && process.env.VIBE_JWT_DEBUG === '1');
const dlog = (...args) => { if (DEBUG) { try { console.error('[jwt]', ...args); } catch {} } };

/** base64url decode to Buffer */
function b64uDecode(u){
  const b64 = String(u).replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(String(u).length/4)*4,'=');
  return Buffer.from(b64, 'base64');
}
/** base64url encode from Buffer */
function b64uEncode(buf){
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

/** Convert RSA JWK to PEM public key */
function jwkToPem(jwk){
  // Minimal RS256 support
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) throw new Error('bad jwk');
  const n = b64uDecode(jwk.n);
  const e = b64uDecode(jwk.e);
  // ASN.1 DER for RSAPublicKey { n, e }
  function derLen(buf){ if (buf.length < 128) return Buffer.from([buf.length]); const bytes=[]; let len=buf.length; while(len>0){ bytes.unshift(len & 0xff); len >>=8; } return Buffer.from([0x80|bytes.length, ...bytes]); }
  function derInt(buf){ if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0x00]), buf]); return Buffer.concat([Buffer.from([0x02]), derLen(buf), buf]); }
  const seq = Buffer.concat([derInt(n), derInt(e)]);
  const der = Buffer.concat([Buffer.from([0x30]), derLen(seq), seq]);
  const b64 = der.toString('base64').replace(/(.{64})/g,'$1\n');
  return `-----BEGIN RSA PUBLIC KEY-----\n${b64}\n-----END RSA PUBLIC KEY-----\n`;
}

/** Simple HTTP(S) GET helper returning { status, headers, body } */
function httpGet(urlStr){
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(u, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: Object.fromEntries(Object.entries(res.headers).map(([k,v]) => [String(k).toLowerCase(), Array.isArray(v)?v.join(','):String(v)])),
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// JWKS cache: Map<url, { keysByKid: Map, anyKeys: Array, exp: epoch_ms }>
const _jwksCache = new Map();

async function fetchJwksWithCache(jwksUrl){
  const now = Date.now();
  const cached = _jwksCache.get(jwksUrl);
  if (cached && cached.exp > now && cached.anyKeys?.length) return cached;
  const res = await httpGet(jwksUrl);
  if (res.status !== 200) throw new Error('jwks fetch failed');
  let json;
  try { json = JSON.parse(res.body); } catch { throw new Error('jwks parse failed'); }
  const keys = Array.isArray(json.keys) ? json.keys : [];
  const byKid = new Map();
  for (const k of keys) { if (k.kid) byKid.set(k.kid, k); }
  // Cache-Control header honor with 15-min cap
  let ttlMs = 300_000; // 5 min default
  const cc = String(res.headers['cache-control']||'').toLowerCase();
  const m = /max-age\s*=\s*(\d+)/.exec(cc);
  if (m) {
    const maxAge = Math.max(0, Number(m[1]||0)) * 1000;
    ttlMs = Math.min(maxAge || ttlMs, 900_000); // cap at 15 min
  } else {
    ttlMs = 900_000; // fallback to 15 min cap if no header present
  }
  const exp = now + ttlMs;
  const entry = { keysByKid: byKid, anyKeys: keys, exp };
  _jwksCache.set(jwksUrl, entry);
  dlog('jwks cached', { size: keys.length, exp });
  return entry;
}

function selectKey(jwks, header){
  if (header.kid && jwks.keysByKid.has(header.kid)) return jwks.keysByKid.get(header.kid);
  // Fallback: pick any RS256 signing key
  for (const k of jwks.anyKeys) {
    if ((k.use === 'sig' || !k.use) && (k.alg === 'RS256' || !k.alg) && k.kty === 'RSA') return k;
  }
  throw new Error('no jwk for kid');
}

/**
 * Verify JWT with RS256 using JWKS.
 * opts: { jwksUrl, aud, iss, clockSkewS=90 }
 * returns { header, payload }
 */
export async function verifyJwt(jwt, opts = {}){
  if (!jwt || typeof jwt !== 'string') throw new Error('no token');
  const [headB64, payloadB64, sigB64] = jwt.split('.');
  if (!headB64 || !payloadB64 || !sigB64) throw new Error('bad token');
  let header, payload;
  try { header = JSON.parse(b64uDecode(headB64).toString('utf-8')); } catch { throw new Error('bad header'); }
  try { payload = JSON.parse(b64uDecode(payloadB64).toString('utf-8')); } catch { throw new Error('bad payload'); }
  if (header.alg !== 'RS256') throw new Error('bad alg');
  const signingInput = Buffer.from(`${headB64}.${payloadB64}`, 'utf-8');
  const signature = b64uDecode(sigB64);

  const jwksUrl = opts.jwksUrl || process.env.VIBE_JWKS_URL;
  if (!jwksUrl) throw new Error('no jwks');
  const jwks = await fetchJwksWithCache(jwksUrl);
  const jwk = selectKey(jwks, header);
  const pem = jwkToPem(jwk);

  const ok = crypto.createVerify('RSA-SHA256').update(signingInput).verify(pem, signature);
  if (!ok) throw new Error('bad signature');

  // Claims checks
  const now = Math.floor(Date.now()/1000);
  const clockSkewSec = Number.isFinite(opts.clockSkewS) ? Number(opts.clockSkewS) : 90;
  if (typeof payload.exp === 'number' && now > payload.exp + clockSkewSec) throw new Error('token expired');
  if (typeof payload.nbf === 'number' && now + clockSkewSec < payload.nbf) throw new Error('token not yet valid');
  if (opts.aud !== undefined){
    const pAud = payload.aud;
    const audOk = Array.isArray(pAud) ? pAud.includes(opts.aud) : pAud === opts.aud;
    if (!audOk) throw new Error('bad aud');
  }
  if (opts.iss !== undefined && payload.iss !== opts.iss) throw new Error('bad iss');

  return { header, payload };
}

export default { verifyJwt };
