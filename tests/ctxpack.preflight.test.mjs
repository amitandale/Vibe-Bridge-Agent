import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightCtxpack } from '../lib/checks/ctxpackPreflight.mjs';

test('ctxpack: preflight passes for ordered pack', () => {
  const pack = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'deadbee' },
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 0, max_files: 0, max_per_file_tokens: 0, section_caps: {templates:0,spec_canvas:0,diff_slices:0,linked_tests:0,contracts:0,extras:0}},
    sections: [], must_include: [], nice_to_have: [], never_include: [], provenance: [], hash: '0'.repeat(64)
  };
  const res = preflightCtxpack(pack, 'warn');
  assert.equal(res.ok, true);
});
