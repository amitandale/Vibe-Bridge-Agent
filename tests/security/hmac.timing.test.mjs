// tests/security/hmac.timing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqualStr } from '../../lib/security/hmac.mjs';

function measure(fn, a, b, n){
  const t0 = process.hrtime.bigint();
  for (let i=0;i<n;i++) fn(a,b);
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0) / 1e6; // ms
}

test('timing variance between match and mismatch is small', () => {
  const a = 'x'.repeat(64);
  const b = 'x'.repeat(64);
  const c = 'y'.repeat(64);

  // Warm-up
  for (let i=0;i<3;i++){ measure(timingSafeEqualStr, a, b, 5_000); measure(timingSafeEqualStr, a, c, 5_000); }

  // Sample several runs and compare medians to reduce noise
  const samples = 7;
  const N = 20_000;
  const match = [];
  const mismatch = [];
  for (let i=0;i<samples;i++){
    match.push(measure(timingSafeEqualStr, a, b, N));
    mismatch.push(measure(timingSafeEqualStr, a, c, N));
  }
  match.sort((x,y)=>x-y);
  mismatch.sort((x,y)=>x-y);
  const medMatch = match[Math.floor(samples/2)];
  const medMismatch = mismatch[Math.floor(samples/2)];

  const ratio = medMismatch > medMatch ? medMismatch / medMatch : medMatch / medMismatch;
  // Allow broader headroom to avoid CI jitter while still catching gross issues
  assert.ok(ratio < 1.4, `ratio ${ratio} too high; medMatch=${medMatch.toFixed(3)}ms medMismatch=${medMismatch.toFixed(3)}ms`);
});
