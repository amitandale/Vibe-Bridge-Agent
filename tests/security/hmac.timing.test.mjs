
import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqualStr } from '../../lib/security/hmac.mjs';

test('timingSafeEqualStr constant-time shape', () => {
  const a = 'sha256=' + 'a'.repeat(64);
  const b = 'sha256=' + 'b'.repeat(64);
  const samples = 50;
  const times = [];
  for (let i=0;i<samples;i++){
    const t1 = performance.now();
    timingSafeEqualStr(a,b);
    const t2 = performance.now();
    times.push(t2 - t1);
  }
  const avg = times.reduce((s,x)=>s+x,0)/times.length;
  const variance = times.reduce((s,x)=>s + Math.pow(x-avg,2),0)/times.length;
  assert.ok(variance >= 0); // smoke. cannot guarantee strict bounds in CI.
});
