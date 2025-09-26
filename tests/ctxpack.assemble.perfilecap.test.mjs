import test from 'node:test';
import assert from 'node:assert/strict';

test('assemble: per-file token cap constrains single-file total', { timeout: 15000 }, async () => {
  const { assemble } = await import('../lib/ctxpack/assemble.mjs');
  const draft = {
    version: 'ctxpack.v1', project:'demo', pr:'1', mode:'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 5000, max_files: 10, max_per_file_tokens: 30, section_caps: {} },
    must_include: [], nice_to_have: [], never_include: [],
    extras: [
      { id:'big', section:'extras', path:'src/one.js', start_line:1, end_line:999, text:'x '.repeat(500) }
    ],
    templates: [], spec_canvas: [], diff_slices: [], linked_tests: [], contracts: []
  };
  const m = await assemble(draft, { model: 'default', merge_max_tokens: 0 });
  const tot = m?.metrics?.tokens_total ?? 0;
  assert.ok(tot <= 30, `tokens_total ${tot} should be <= per-file cap 30 for single-file input`);
});
