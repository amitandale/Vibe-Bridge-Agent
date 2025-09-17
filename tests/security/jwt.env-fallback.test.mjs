// tests/security/jwt.env-fallback.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { requireTicket } from '../../lib/security/guard.mjs';

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

await test('prefer VIBE_TICKET_* over VIBE_JWT_*', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { server, url } = await startJwksServer(publicKey);
  const now = Math.floor(Date.now()/1000);
  const payload = { iss: 'niss', aud: 'new', sub: 'projY', iat: now-5, nbf: now-5, exp: now+60, jti: 'j2', scope: 'bridge:write' };
  const token = signJwt(payload, privateKey);

  const mw = requireTicket(['bridge:write'], { jwksUrl: url, env: { VIBE_TICKET_AUD: 'new', VIBE_JWT_AUD: 'old', VIBE_TICKET_ISS: 'niss', VIBE_JWT_ISS: 'oiss' } });
  let called = false;
  const req = { headers: { 'x-vibe-project': 'projY', 'x-vibe-ticket': token } };
  await mw(req, { status(){}, set(){}, send(){} }, () => { called = true; });
  assert.equal(called, true);
  server.close();
});
