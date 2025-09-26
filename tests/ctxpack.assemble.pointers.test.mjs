import test from 'node:test';
import assert from 'node:assert/strict';

test('assemble: duplicates across sections create pointers', { timeout: 15000 }, async () => {
  const { assemble } = await import('../lib/ctxpack/assemble.mjs');
  const draft = {
    version: 'ctxpack.v1', project:'demo', pr:'1', mode:'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 5000, max_files: 10, max_per_file_tokens: 500, section_caps: {} },
    must_include: [], nice_to_have: [], never_include: [],
    templates: [{ id:'x', section:'templates', path:'src/f.js', start_line:1, end_line:3, text:'same' }],
    extras:    [{ id:'y', section:'extras',    path:'src/f.js', start_line:1, end_line:3, text:'same' }],
    spec_canvas: [], diff_slices: [], linked_tests: [], contracts: []
  };
  const m = await assemble(draft, { model: 'default', merge_max_tokens: 0 });
  const ptrs = m?.pointers || [];
  assert.ok(ptrs.length >= 1, 'expected at least one pointer');
});
