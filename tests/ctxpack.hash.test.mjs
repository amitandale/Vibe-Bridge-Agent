import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Canonical } from '../lib/ctxpack/index.mjs';

test('ctxpack: canonical hash identical for same content', () => {
  const a = {x:1,y:{b:2,a:1}};
  const b = {y:{a:1,b:2},x:1};
  assert.equal(sha256Canonical(a), sha256Canonical(b));
});
