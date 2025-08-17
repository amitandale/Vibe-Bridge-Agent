import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify } from '../testlib/verify.mjs';

test('verify fails with wrong signature', () => {
  const ok = verify('{"a":1}', 'sha256=deadbeef', 's3cr3t');
  assert.equal(ok, false);
});

test('verify succeeds with correct signature', () => {
  const raw = '{"a":1}';
  const sig = sign(raw, 's3cr3t');
  assert.equal(verify(raw, sig, 's3cr3t'), true);
});
