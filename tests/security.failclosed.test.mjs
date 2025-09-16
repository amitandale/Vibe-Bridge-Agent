
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as heartbeat from '../lib/routes/heartbeat.mjs';

function b64url(b){ return Buffer.from(b).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pubJwk = publicKey.export({ format:'jwk' });
const kid = crypto.createHash('sha256').update(publicKey.export({ type:'spki', format:'der' })).digest('hex').slice(0,16);
function signJwt(payload){
  const header = { alg:'RS256', typ:'JWT', kid };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const s = crypto.createSign('RSA-SHA256').update(h+'.'+p).sign(privateKey);
  const sig = b64url(s);
  return `${h}.${p}.${sig}`;
}
global.fetch = async (url) => {
  if (String(url).includes('/.well-known/jwks.json')) {
    return new Response(JSON.stringify({ keys: [{ ...pubJwk, use:'sig', alg:'RS256', kid }] }), { status:200, headers: { 'content-type':'application/json' }});
  }
  throw new Error('unexpected fetch ' + url);
};
const SECRET = 'bridge-secret';
function sig(body){ const h=crypto.createHmac('sha256', SECRET); h.update(body); return 'sha256='+h.digest('hex'); }

test('heartbeat sets disabled true', async () => {
  process.env.BRIDGE_SECRET = SECRET;
  process.env.VIBE_CI_URL = 'https://ci.local';
  const ticket = signJwt({ iss:'vibe-ci', sub:'p1', scope:'bridge.heartbeat', aud:'bridge', iat: Math.floor(Date.now()/1000), nbf: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+60, jti:'1' });
  const hbBody = JSON.stringify({ projectId:'p1', disable:true });
  const res = await heartbeat.POST(new Request('http://x/api/heartbeat', { method:'POST', headers:{ 'x-signature': sig(hbBody), 'x-vibe-ticket': ticket, 'content-type':'application/json' }, body: hbBody }));
  const rj = await res.json();
  assert.equal(rj.disable, true);
});
