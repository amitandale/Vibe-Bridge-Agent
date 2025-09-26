
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../../lib/ctxpack/assemble.mjs';
import { sha256Canonical } from '../../lib/ctxpack/hash.mjs';

function makePack() {
  const order = ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'];
  const sections = [
    { name: 'diff_slices', items: [
      { id:'keep1', path:'src/a.ts', start_line:10, end_line:12, text:'alpha' },
      { id:'drop1', path:'src/b.ts', start_line:20, end_line:25, text:'beta' },
      { id:'keep2', path:'src/b.ts', start_line:30, end_line:35, text:'beta later' }
    ]}
  ];
  const pack = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'abcdef1' },
    mode: 'MVP',
    order,
    budgets: {
      max_tokens: 1000000,
      max_files: 1000,
      max_per_file_tokens: 1000000,
      section_caps: { templates:1000,spec_canvas:1000,diff_slices:1000,linked_tests:1000,contracts:1000,extras:1000 }
    },
    sections,
    never_include: [
      { section: 'diff_slices', kind:'span', loc:{ path:'src/b.ts', start_line:20, end_line:25 }, text:'beta' }
    ],
    provenance: []
  };
  const clone = JSON.parse(JSON.stringify(pack)); delete clone.hash;
  pack.hash = sha256Canonical(clone);
  return pack;
}

test('never_include removes matching items before placement', { timeout: 15000 }, async () => {
  const pack = makePack();
  const m = await assemble(pack, { model: 'default' });
  const sec = (Array.isArray(m?.sections) ? m.sections : []).find(s => s?.name==='diff_slices');
  assert.ok(sec && Array.isArray(sec.items), 'diff_slices present');
  const ids = sec.items.map(x => x.id);
  assert.ok(ids.includes('keep1'), 'keep1 remains');
  assert.ok(ids.includes('keep2'), 'keep2 remains');
  assert.ok(!ids.includes('drop1'), 'drop1 removed by never_include');
  assert.equal((m.pointers||[]).length, 0, 'no pointers created for never_include');
});
