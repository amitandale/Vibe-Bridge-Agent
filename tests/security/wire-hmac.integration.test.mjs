// tests/security/wire-hmac.integration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { _clearStore, _seed, sign } from '../../lib/security/hmac.mjs';

function mkReq(bodyBuf, headers){
  const u = new URL('http://x/y');
  return {
    url: u.href,
    headers: new Map(Object.entries(headers||{})),
    on(event, fn){ if (event==='data'){ fn(bodyBuf); } if (event==='end'){ fn(); } },
    once(){}, emit(){}, setEncoding(){}, readable: true
  };
}

test('signed request passes when HMAC_ENFORCE=1', async () => {
  process.env.HMAC_ENFORCE = '1';
  _clearStore();
  _seed({ projectId:'p1', kid:'k1', key:'s1' });
  const raw = Buffer.from('{"ok":true}');
  const sig = sign(raw, 's1');
  const req = mkReq(raw, { 'x-vibe-project':'p1', 'x-vibe-kid':'k1', 'x-signature': sig });
  const { requireHmac } = await import('../../lib/security/hmac.mjs');
  const mw = requireHmac();
  const res = { statusCode:0, headers:{}, setHeader(){}, end(){} };
  await mw(req, res, ()=>{});
  assert.equal(res.statusCode === 0 || res.statusCode === 200, true);
});
