// tests/security/hmac.middleware.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { _clearStore, _seed, sign } from '../../lib/security/hmac.mjs';
import { requireHmac } from '../../lib/security/guard.mjs';

function mkReq(body, headers = {}){
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '');
  return {
    headers,
    arrayBuffer: async () => buf, // simulate Web Request
  };
}

test('middleware 401 when no active key', async () => {
  _clearStore();
  const mw = requireHmac();
  const req = mkReq('', { 'x-vibe-project': 'p1', 'x-vibe-kid': 'k1', 'x-signature': 'sha256=00' });
  let out;
  const res = { setHeader(){}, end(b){ out = b; }, statusCode: 0 };
  await mw(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.ok(String(out).includes('ERR_HMAC_MISSING'));
});

test('middleware 403 on mismatch, passes on correct', async () => {
  _clearStore();
  _seed({ projectId: 'p1', kid: 'k1', key: 's1' });
  const mw = requireHmac();
  const raw = Buffer.from('{"x":1}');
  const badReq = mkReq(raw, { 'x-vibe-project': 'p1', 'x-vibe-kid': 'k1', 'x-signature': 'sha256=dead' });
  const res1 = { setHeader(){}, end(){}, statusCode: 0 };
  await mw(badReq, res1, () => {});
  assert.equal(res1.statusCode, 403);

  const goodSig = sign(raw, 's1');
  const goodReq = mkReq(raw, { 'x-vibe-project': 'p1', 'x-vibe-kid': 'k1', 'x-signature': goodSig });
  let nextCalled = false;
  await mw(goodReq, { setHeader(){}, end(){} , statusCode: 0 }, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(goodReq.vibe.projectId, 'p1');
  assert.equal(goodReq.vibe.hmac.kid, 'k1');
});
