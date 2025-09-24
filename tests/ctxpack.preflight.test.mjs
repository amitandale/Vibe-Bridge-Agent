import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightCtxpack } from '../lib/checks/ctxpackPreflight.mjs';

test('ctxpack: preflight warn when out of order', () => {
  const pack = {
    version: 1,
    meta: { project: 'p', branch: 'b', commit: '1234567', generatedAt: new Date().toISOString() },
    sections: [
      { name: 'extras', items: [] },
      { name: 'templates', items: [] }
    ]
  };
  const res = preflightCtxpack(pack, 'warn');
  assert.equal(res.ok, true);
  assert.ok(res.warnings.length >= 1);
});

test('ctxpack: preflight enforce fails on invalid', () => {
  const pack = { version: 1, meta: { project: '', branch: 'b', commit: '123', generatedAt: 'x' }, sections: [] };
  const res = preflightCtxpack(pack, 'enforce');
  assert.equal(res.ok, false);
});
