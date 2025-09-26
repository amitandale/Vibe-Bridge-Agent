import test from 'node:test';
import assert from 'node:assert/strict';

test('assemble: overlapping ranges merge when within merge_max_tokens', { timeout: 15000 }, async () => {
  const { assemble } = await import('../lib/ctxpack/assemble.mjs');
  const draft = {
    version: 'ctxpack.v1', project:'demo', pr:'1', mode:'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 5000, max_files: 10, max_per_file_tokens: 500, section_caps: {} },
    must_include: [], nice_to_have: [], never_include: [],
    diff_slices: [
      { id:'a', section:'diff_slices', path:'src/m.js', start_line:1, end_line:10, text:'1111111111' },
      { id:'b', section:'diff_slices', path:'src/m.js', start_line:8, end_line:15, text:'2222222' }
    ],
    templates: [], extras: [], spec_canvas: [], linked_tests: [], contracts: []
  };
  const m = await assemble(draft, { model: 'default', merge_max_tokens: 1000 });
  const mergedCount = m?.metrics?.merged_spans || 0;
  assert.ok(mergedCount >= 1, 'expected at least one merged span');
});
