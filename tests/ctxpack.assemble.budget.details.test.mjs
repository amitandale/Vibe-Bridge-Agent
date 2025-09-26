import test from 'node:test';
import assert from 'node:assert/strict';

test('assemble: must_include overflow yields BUDGET_ERROR', { timeout: 15000 }, async () => {
  const { assemble } = await import('../lib/ctxpack/assemble.mjs');
  const draft = {
    version: 'ctxpack.v1', project:'demo', pr:'1', mode:'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 1, max_files: 1, max_per_file_tokens: 1, section_caps: {} },
    must_include: ['must'], nice_to_have: [], never_include: [],
    templates: [{ id:'must', section:'templates', path:'src/x.js', start_line:1, end_line:2, text:'TOO BIG FOR CAP' }],
    spec_canvas: [], diff_slices: [], linked_tests: [], contracts: [], extras: []
  };
  let threw = false;
  try {
    await assemble(draft, { model: 'default', merge_max_tokens: 0 });
  } catch (e) {
    threw = true;
    assert.equal(e?.code || e?.name, 'BUDGET_ERROR');
  }
  assert.equal(threw, true);
});
