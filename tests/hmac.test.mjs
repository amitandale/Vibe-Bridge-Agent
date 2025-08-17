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

test('verify fails with wrong signature', () => {
  const ok = verify('{"a":1}', 'sha256=deadbeef', 's3cr3t');
  assert.equal(ok, false);
});

test('verify succeeds with correct signature', () => {
  const raw = '{"a":1}';
  const sig = sign(raw, 's3cr3t');
  assert.equal(verify(raw, sig, 's3cr3t'), true);
});
