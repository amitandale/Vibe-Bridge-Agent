// tests/security/guard.project-binding.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { requireTicket } from "../../lib/security/guard.mjs";

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

await test('requires x-vibe-project when scopes are requested; sub must match', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { server, url } = await startJwksServer(publicKey);
  const now = Math.floor(Date.now()/1000);
  const payload = { iss: 'saas', aud: 'bridge', sub: 'projX', iat: now-5, nbf: now-5, exp: now+60, jti: 'j1', scope: 'bridge:write' };
  const token = signJwt(payload, privateKey);

  // Missing header -> 400
  let status = 0, body = '';
  const req0 = { headers: { 'x-vibe-ticket': token } };
  const res0 = { status: (s)=>{status=s;}, set(){}, send: (b)=>{body=b;} };
  const mw = requireTicket(['bridge:write'], { jwksUrl: url, env: { VIBE_TICKET_AUD: 'bridge', VIBE_TICKET_ISS: 'saas' } });
  await mw(req0, res0, () => {});
  assert.equal(status, 400);
  assert.match(String(body||''), /missing x-vibe-project/);

  // Wrong header -> 403
  status = 0; body = '';
  const req1 = { headers: { 'x-vibe-project': 'other', 'x-vibe-ticket': token } };
  const res1 = { status: (s)=>{status=s;}, set(){}, send: (b)=>{body=b;} };
  await mw(req1, res1, () => {});
  assert.equal(status, 403);
  assert.match(String(body||''), /subject mismatch/);

  // Correct header -> next()
  let called = false;
  const req2 = { headers: { 'x-vibe-project': 'projX', 'x-vibe-ticket': token } };
  await mw(req2, { status(){}, set(){}, send(){} }, () => { called = true; });
  assert.equal(called, true);
  server.close();
});
