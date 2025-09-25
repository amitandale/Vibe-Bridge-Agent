import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { assembleAndPersist } from '../lib/ctxpack/integration.mjs';
import { sha256Canonical } from '../lib/ctxpack/hash.mjs';

test('integration: assembleAndPersist writes manifest and is deterministic', async () => {
  const pack = JSON.parse(await fs.readFile('assets/examples/ctxpack/contextpack.mvp.json', 'utf8'));
  const outPath = 'assets/examples/ctxpack/manifest.itest.json';
  try { await fs.unlink(outPath); } catch {}
  const m1 = await assembleAndPersist(pack, { model:'gpt-xyz', outPath, mode:'warn' });
  const m2 = await assembleAndPersist(pack, { model:'gpt-xyz', outPath, mode:'warn' });
  assert.deepEqual(m1.sections, m2.sections);
  assert.equal(m1.hash, m2.hash);
  const saved = JSON.parse(await fs.readFile(outPath, 'utf8'));
  assert.equal(saved.hash, m1.hash);
});

test('integration: non-droppable overflow yields non-zero semantics (throws)', async () => {
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
  const c = structuredClone(pack); delete c.hash; pack.hash = sha256Canonical(c);
  try {
    await assembleAndPersist(pack, { outPath:'assets/examples/ctxpack/manifest.fail.json', mode:'warn' });
    assert.fail('expected throw');
  } catch (e) {
    assert.equal(e.code, 'BUDGET_ERROR');
  }
});
