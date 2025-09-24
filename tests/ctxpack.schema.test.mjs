import test from 'node:test';
import assert from 'node:assert/strict';
import { validateObject } from '../lib/ctxpack/index.mjs';

const base = () => ({
  version: '1.0.0',
  project: { id: 'demo' },
  pr: { id: '42', branch: 'work', commit_sha: 'deadbeef' },
  mode: 'PR',
  order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
  budgets: { max_tokens: 1, max_files: 1, max_per_file_tokens: 1, section_caps: {templates:0,spec_canvas:0,diff_slices:0,linked_tests:0,contracts:0,extras:0}},
  sections: [],
  must_include: [],
  nice_to_have: [],
  never_include: [],
  provenance: [],
  hash: '0'.repeat(64)
});

test('ctxpack: minimal valid top-level shape', () => {
  const p = base();
  const res = validateObject(p, { strictOrder:true });
  assert.equal(res.ok, true);
});

test('ctxpack: rejects unknown top-level fields', () => {
  const p = base();
  p.unknown = 1;
  try { validateObject(p); assert.fail('should reject'); }
  catch (e) { assert.equal(e.code, 'SCHEMA_INVALID'); }
});

test('ctxpack: rejects bad version unless minor allowed', () => {
  const p = base(); p.version = '2.0.0';
  try { validateObject(p, { allowMinor:false }); assert.fail('should reject'); }
  catch (e) { assert.equal(e.code, 'SCHEMA_INVALID'); }
});
