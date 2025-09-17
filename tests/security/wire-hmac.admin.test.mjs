// tests/security/wire-hmac.admin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { GET as GET_KEYS } from '../../app/api/admin/hmac/get-keys/route.mjs';
import { PUT as PUT_ROTATE } from '../../app/api/admin/hmac/put-rotate/route.mjs';

function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function signJwt(payload, key){
  const header = { alg: 'RS256', typ: 'JWT', kid: 'k1' };
  const enc = (obj) => b64u(Buffer.from(JSON.stringify(obj)));
  const input = enc(header) + '.' + enc(payload);
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(key);
  return input + '.' + b64u(sig);
}
function startJwksServer(pubKey){
  const jwk = pubKey.export({ format: 'jwk' });
  jwk.kid = 'k1'; jwk.use = 'sig'; jwk.alg = 'RS256';
  const server = http.createServer((req, res) => {
    res.setHeader('cache-control','no-store');
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/.well-known/jwks.json` });
    });
  });
}

// Minimal Request-like shim
class Req {
  constructor(h, body){
    this._headers = new Map();
    for (const [k,v] of Object.entries(h||{})) this._headers.set(k.toLowerCase(), String(v));
    this._body = body;
  }
  headers = {
    get: (k) => this._headers.get(String(k).toLowerCase()) || null,
    [Symbol.iterator]: () => this._headers[Symbol.iterator]()
  };
  async json(){ return this._body || {}; }
  get body(){ return this._body; }
}

await test('admin routes: rotate then list keys', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { server, url } = await startJwksServer(publicKey);
  // env expected by guard
  process.env.VIBE_JWKS_URL = url;
  process.env.VIBE_TICKET_AUD = 'bridge';
  process.env.VIBE_TICKET_ISS = 'saas';
  const now = Math.floor(Date.now()/1000);
  const token = signJwt({ iss: 'saas', aud: 'bridge', sub: 'projA', iat: now-5, nbf: now-5, exp: now+60, jti: 'adm1', scope: 'bridge:admin' }, privateKey);

  // Rotate
  const reqRotate = new Req({ 'x-vibe-ticket': token, 'x-vibe-project': 'projA', 'content-type': 'application/json' }, { kid: 'k-new', key: 'a'.repeat(64), projectId: 'projA' });
  const resRotate = await PUT_ROTATE(reqRotate);
  assert.equal(resRotate.status, 200);
  const bodyRotate = await resRotate.json();
  assert.equal(bodyRotate.ok, true);
  assert.equal(bodyRotate.projectId, 'projA');
  assert.equal(bodyRotate.kid, 'k-new');

  // List keys
  const reqKeys = new Req({ 'x-vibe-ticket': token, 'x-vibe-project': 'projA' });
  const resKeys = await GET_KEYS(reqKeys);
  assert.equal(resKeys.status, 200);
  const bodyKeys = await resKeys.json();
  assert.equal(bodyKeys.ok, true);
  assert.equal(bodyKeys.projectId, 'projA');
  assert.ok(Array.isArray(bodyKeys.kids));

  server.close();
});
