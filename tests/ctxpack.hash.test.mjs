import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Canonical } from '../lib/ctxpack/index.mjs';

test('ctxpack: canonical hash is order-independent', () => {
  const a = { version:1, meta:{a:1,b:2}, sections:[{name:'extras', items:[]}]};
  const b = { sections:[{items:[], name:'extras'}], meta:{b:2,a:1}, version:1 };
  const ha = sha256Canonical(a);
  const hb = sha256Canonical(b);
  assert.equal(ha, hb);
  assert.match(ha, /^[a-f0-9]{64}$/);
});
