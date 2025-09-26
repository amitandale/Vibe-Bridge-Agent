import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../lib/ctxpack/assemble.mjs';
import { sha256Canonical } from '../lib/ctxpack/hash.mjs';

function reseal(p){
  const c = structuredClone(p); delete c.hash;
  p.hash = sha256Canonical(c);
  return p;
}

function longText(n){
  return 'X'.repeat(n);
}

test('compression: per-file head/tail compression respects cap', async () => {
  const pack = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'deadbeef' },
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 10000, max_files: 10, max_per_file_tokens: 20, section_caps:{templates:2,spec_canvas:2,diff_slices:2,linked_tests:2,contracts:2,extras:2} },
    sections: [
      { name:'templates', items: [ { id:'a.txt', content: longText(1000), symbol:'Header' } ] },
      { name:'spec_canvas', items: [] },
      { name:'diff_slices', items: [] },
      { name:'linked_tests', items: [] },
      { name:'contracts', items: [] },
      { name:'extras', items: [] },
    ],
    must_include: [], nice_to_have: [], never_include: [], provenance: [], hash: '0'.repeat(64)
  };
  reseal(pack);
  const { manifest } = await assemble(pack);
  const tpl = manifest.sections.find(s=>s.name==='templates').items[0];
  assert.ok(tpl.tokens <= 20, 'compressed tokens must be <= per-file cap');
  assert.ok(String(tpl.text).includes('\n...\n'), 'compressed text contains head/tail marker');
});

test('dedup: intra- and inter-section duplicates removed', async () => {
  const pack = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'deadbeef' },
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 10000, max_files: 10, max_per_file_tokens: 1000, section_caps:{templates:10,spec_canvas:10,diff_slices:10,linked_tests:10,contracts:10,extras:10} },
    sections: [
      { name:'templates', items: [ { id:'dup.txt', content: 'SAME' }, { id:'dup2.txt', content: 'SAME' } ] },
      { name:'spec_canvas', items: [] },
      { name:'diff_slices', items: [] },
      { name:'linked_tests', items: [] },
      { name:'contracts', items: [] },
      { name:'extras', items: [ { id:'dup3.txt', content: 'SAME' } ] },
    ],
    must_include: [], nice_to_have: [], never_include: [], provenance: [], hash: '0'.repeat(64)
  };
  reseal(pack);
  const { manifest } = await assemble(pack);
  const tItems = manifest.sections.find(s=>s.name==='templates').items;
  assert.equal(tItems.length, 1, 'intra-section duplicate removed');
  const extras = manifest.sections.find(s=>s.name==='extras').items;
  assert.equal(extras.length, 0, 'inter-section duplicate dropped from later section');
});

test('eviction: over cap keeps closer-to-diff then shorter', async () => {
  const pack = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'deadbeef' },
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 10000, max_files: 10, max_per_file_tokens: 1000, section_caps:{templates:2,spec_canvas:10,diff_slices:10,linked_tests:10,contracts:10,extras:10} },
    sections: [
      { name:'templates', items: [
        { id:'far_long.txt', content: 'A'.repeat(200), distance_to_diff: 100 },
        { id:'near_long.txt', content: 'B'.repeat(200), distance_to_diff: 1 },
        { id:'near_short.txt', content: 'C'.repeat(10), distance_to_diff: 1 }
      ] },
      { name:'spec_canvas', items: [] },
      { name:'diff_slices', items: [] },
      { name:'linked_tests', items: [] },
      { name:'contracts', items: [] },
      { name:'extras', items: [] },
    ],
    must_include: [], nice_to_have: [], never_include: [], provenance: [], hash: '0'.repeat(64)
  };
  reseal(pack);
  const { manifest } = await assemble(pack);
  // section cap 2 -> evict one. Should keep near_short and near_long (both dist=1; then shorter first but both allowed due to cap 2)
  const ids = manifest.sections.find(s=>s.name==='templates').items.map(i=>i.id);
  assert.deepEqual(ids.sort(), ['near_long.txt','near_short.txt'].sort());
});

test('non-droppable: must_include in sections 1–5 triggers hard fail if it cannot fit', async () => {
  const pack = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'deadbeef' },
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 1, max_files: 0, max_per_file_tokens: 1, section_caps:{templates:0,spec_canvas:0,diff_slices:0,linked_tests:0,contracts:0,extras:0} },
    sections: [
      { name:'templates', items: [ { id:'must.txt', content: 'CANNOT FIT' } ] },
      { name:'spec_canvas', items: [] },
      { name:'diff_slices', items: [] },
      { name:'linked_tests', items: [] },
      { name:'contracts', items: [] },
      { name:'extras', items: [] },
    ],
    must_include: ['must.txt'], nice_to_have: [], never_include: [], provenance: [], hash: '0'.repeat(64)
  };
  reseal(pack);
  try {
    await assemble(pack);
    assert.fail('expected hard fail');
  } catch (e) {
    assert.equal(e.code, 'BUDGET_ERROR');
  }
});


test('per-section cap: templates cap limits files placed', async () => {
  const pack = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'deadbeef' },
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 10000, max_files: 10, max_per_file_tokens: 1000, section_caps:{templates:1,spec_canvas:5,diff_slices:5,linked_tests:5,contracts:5,extras:5} },
    sections: [
      { name:'templates', items: [
        { id:'t1.txt', content: 'A'.repeat(20), distance_to_diff: 10 },
        { id:'t2.txt', content: 'B'.repeat(10), distance_to_diff: 1 }
      ] },
      { name:'spec_canvas', items: [] },
      { name:'diff_slices', items: [] },
      { name:'linked_tests', items: [] },
      { name:'contracts', items: [] },
      { name:'extras', items: [] },
    ],
    must_include: [], nice_to_have: [], never_include: [], provenance: [], hash: '0'.repeat(64)
  };
  reseal(pack);
  const { manifest } = await assemble(pack);
  const ids = manifest.sections.find(s=>s.name==='templates').items.map(i=>i.id);
  assert.equal(ids.length, 1);
});
