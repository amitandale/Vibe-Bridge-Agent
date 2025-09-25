import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../lib/ctxpack/assemble.mjs';
import { sha256Canonical } from '../lib/ctxpack/hash.mjs';

test('cross-section pointers: later duplicates become pointers with zero budget', async () => {
  const pack = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'deadbeef' },
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 10000, max_files: 10, max_per_file_tokens: 1000, section_caps:{templates:10,spec_canvas:10,diff_slices:10,linked_tests:10,contracts:10,extras:10} },
    sections: [
      { name:'templates', items: [ { id:'A.txt', content: 'SAME' } ] },
      { name:'spec_canvas', items: [] },
      { name:'diff_slices', items: [] },
      { name:'linked_tests', items: [ { id:'B.txt', content: 'SAME' } ] },
      { name:'contracts', items: [] },
      { name:'extras', items: [] },
    ],
    must_include: [], nice_to_have: [], never_include: [], provenance: [], hash: '0'.repeat(64)
  };
  const c = structuredClone(pack); delete c.hash; pack.hash = sha256Canonical(c);
  const { manifest } = await assemble(pack);
  const tpl = manifest.sections.find(s=>s.name==='templates').items;
  const linked = manifest.sections.find(s=>s.name==='linked_tests').items;
  assert.equal(tpl.length, 1, 'earliest kept');
  assert.equal(linked.length, 1, 'later section has one entry');
  assert.equal(linked[0].pointer, true, 'later is a pointer');
  assert.equal(linked[0].tokens, 0, 'pointer has zero tokens');
  assert.ok(linked[0].ref && linked[0].ref.section === 'templates' && linked[0].ref.id === 'A.txt', 'pointer references earliest');
  const onlyTokens = tpl[0].tokens;
  assert.equal(manifest.totals.tokens, onlyTokens);
});
