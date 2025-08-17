import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function sign(raw, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

function verify(raw, sig, secret) {
  const expected = sign(raw, secret);
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig||'')); }
  catch { return false; }
}

test('verify: empty signature', () => {
  const ok = verify('{"x":1}', '', 'k');
  assert.equal(ok, false);
});

test('verify: wrong secret', () => {
  const raw = '{"x":1}';
  const sig = sign(raw, 'a');
  assert.equal(verify(raw, sig, 'b'), false);
});

test('verify: long signature mismatch timing-safe', () => {
  const raw = '{"x":1}';
  const sig = sign(raw, 's');
  const forged = sig.replace(/.$/, m => (m === 'a' ? 'b' : 'a'));
  assert.equal(verify(raw, forged, 's'), false);
});
