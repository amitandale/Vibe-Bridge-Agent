import test from 'node:test';
import assert from 'node:assert/strict';
import { validateObject } from '../lib/ctxpack/index.mjs';

test('ctxpack: schema validity minimal', () => {
  const pack = {
    version: 1,
    meta: { project: 'p', branch: 'b', commit: '1234567', generatedAt: new Date().toISOString() },
    sections: [
      { name: 'templates', items: [{ id: 't1', content: 'X' }] },
      { name: 'spec_canvas', items: [] },
      { name: 'diff_slices', items: [] },
      { name: 'linked_tests', items: [] },
      { name: 'contracts', items: [] },
      { name: 'extras', items: [] }
    ]
  };
  const res = validateObject(pack);
  assert.equal(res.ok, true);
});

test('ctxpack: invalid when missing meta.project', () => {
  const bad = {
    version: 1, meta: { branch:'b', commit:'1234567', generatedAt:new Date().toISOString() }, sections: []
  };
  try {
    validateObject(bad);
    assert.fail('should throw');
  } catch (err) {
    assert.equal(err.code, 'MISSING_REQUIRED');
  }
});
