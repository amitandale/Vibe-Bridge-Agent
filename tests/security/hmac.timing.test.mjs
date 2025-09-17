// tests/security/hmac.timing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqualStr } from '../../lib/security/hmac.mjs';

function measure(fn, a, b, n=2000){
  const t0 = process.hrtime.bigint();
  for (let i=0;i<n;i++) fn(a,b);
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0) / 1e6;
}

test('timing variance between match and mismatch is small', () => {
  const a = 'x'.repeat(64);
  const b = 'x'.repeat(64);
  const c = 'y'.repeat(64);
  const tMatch = measure(timingSafeEqualStr, a, b);
  const tMismatch = measure(timingSafeEqualStr, a, c);
  const ratio = tMismatch > tMatch ? tMismatch / tMatch : tMatch / tMismatch;
  assert.ok(ratio < 1.2);
});
