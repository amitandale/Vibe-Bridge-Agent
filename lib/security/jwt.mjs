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

/** Parse a JWT string. Returns { header, payload, signature, signingInput } */
function parseJwt(token){
  if (typeof token !== 'string') throw new TypeError('token must be string');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, s] = parts;
  const decodeJson = (x) => {
    const buf = b64uDecode(x);
    try { return JSON.parse(buf.toString('utf8')); }
    catch (e) { throw new Error('malformed token json'); }
  };
  const header = decodeJson(h);
  const payload = decodeJson(p);
  const signature = b64uDecode(s);
  const signingInput = `${h}.${p}`;
  return { header, payload, signature, signingInput };
}

/** Fetch JWKS JSON from a URL */
async function fetchJwks(urlStr){
  const url = new URL(urlStr);
  const mod = url.protocol === 'https:' ? https : http;
  return await new Promise((resolve, reject) => {
    const req = mod.get(url, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`jwks fetch ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('jwks parse error')); }
      });
    });
    req.on('error', reject);
  });
}

/** Choose a JWK from a JWKS by kid if available */
function selectJwk(jwks, kid){
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  if (!keys.length) return undefined;
  if (kid){
    const k = keys.find(k => k.kid === kid);
    if (k) return k;
  }
  return keys[0];
}

/** Create a Node KeyObject from possible inputs */
function toPublicKeyObject({ jwk, pem, key }){
  if (key && typeof key === 'object' && typeof key.asymmetricKeyType === 'string') {
    return key; // already KeyObject
  }
  if (jwk) {
    // Ensure RS256 type
    if (jwk.kty !== 'RSA') throw new Error('unsupported jwk type');
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }
  if (pem) {
    return crypto.createPublicKey({ key: pem, format: 'pem', type: 'spki' });
  }
  throw new Error('missing key');
}

/**
 * Verify a JWT signed with RS256.
 * opts:
 *   - jwksUrl: URL to fetch JWKS
 *   - jwks: preloaded JWKS object
 *   - jwk: single JWK
 *   - publicKeyPem: PEM public key
 *   - key: Node KeyObject
 *   - aud: expected audience (string)
 *   - iss: expected issuer (string)
 *   - clockSkewS | clockSkewSec: seconds of allowed skew (default 60)
 */
export async function verifyJwt(token, opts = {}){
  const { header, payload, signature, signingInput } = parseJwt(token);
  const aud = opts.aud;
  const iss = opts.iss;
  const clockSkewSec = opts.clockSkewSec ?? opts.clockSkewS ?? 60;

  // Only RS256 supported
  if (header.alg !== 'RS256') throw new Error('unsupported alg');

  // Build a KeyObject from the supplied options
  let keyObj;
  if (opts.key || opts.publicKeyPem) {
    keyObj = toPublicKeyObject({ key: opts.key, pem: opts.publicKeyPem });
  } else if (opts.jwk) {
    keyObj = toPublicKeyObject({ jwk: opts.jwk });
  } else {
    // JWKS path: either provided or fetched
    const jwks = opts.jwks ?? (opts.jwksUrl ? await fetchJwks(opts.jwksUrl) : undefined);
    if (!jwks) throw new Error('missing key');
    const jwk = selectJwk(jwks, header.kid);
    if (!jwk) throw new Error('missing key');
    keyObj = toPublicKeyObject({ jwk });
  }

  dlog('verify', { kid: header.kid, sigLen: signature.length, keyType: keyObj.asymmetricKeyType });

  // Verify using PKCS1 v1.5 with SHA-256
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(signingInput, 'utf8'),
    { key: keyObj, padding: crypto.constants.RSA_PKCS1_PADDING },
    signature
  );
  if (!ok) throw new Error('bad signature');

  // Temporal checks with skew
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now > payload.exp + clockSkewSec) throw new Error('token expired');
  if (typeof payload.nbf === 'number' && now + clockSkewSec < payload.nbf) throw new Error('token not yet valid');

  // Issuer and audience checks
  if (aud !== undefined){
    const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
    if (!audOk) throw new Error('bad aud');
  }
  if (iss !== undefined && payload.iss !== iss) throw new Error('bad iss');

  return { header, payload };
}

export default { verifyJwt };
