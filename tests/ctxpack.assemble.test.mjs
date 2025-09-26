import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../lib/ctxpack/assemble.mjs';
import { validateObject } from '../lib/ctxpack/validate.mjs';
import { sha256Canonical } from '../lib/ctxpack/hash.mjs';
import fs from 'node:fs/promises';

async function load(p){ return fs.readFile(p, 'utf8').then(s=>JSON.parse(s)); }

test('assemble: enforces canonical section order and stable in-section sort', async () => {
  const pack = await load('assets/examples/ctxpack/contextpack.mvp.json');
  validateObject(pack, { strictOrder: true });
  const { manifest } = await assemble(pack);
  const names = manifest.sections.map(s=>s.name);
  assert.deepEqual(names, ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras']);
  // Stable sort: ensure path order monotonic inside a section
  for (const sec of manifest.sections){
    const names = sec.items.map(i => i.id);
    const sorted = [...names].sort((a,b)=>String(a).localeCompare(String(b)));
    assert.deepEqual(names, sorted);
  }
});

test('assemble: respects per-section and global caps deterministically', async () => {
  const pack = await load('assets/examples/ctxpack/contextpack.pr.json');
  // Tight caps to force early stops without eviction logic
  pack.budgets.max_files = 3;
  pack.budgets.max_tokens = 1000;
  pack.budgets.section_caps.extras = 0;
  const c = structuredClone(pack); delete c.hash; pack.hash = sha256Canonical(c);
  const { manifest } = await assemble(pack);
  // extras should be empty due to section cap 0
  const extras = manifest.sections.find(s=>s.name==='extras').items;
  assert.equal(extras.length, 0);
  // total files not exceeding global cap
  assert.ok(manifest.totals.files <= 3);
});

test('assemble: output has deterministic hash for identical input', async () => {
  const pack = await load('assets/examples/ctxpack/contextpack.mvp.json');
  const { manifest: m1 } = await assemble(pack);
  const { manifest: m2 } = await assemble(pack);
  assert.equal(m1.hash, m2.hash);
  assert.deepEqual(m1.sections, m2.sections);
});


test('assemble: emits pointers for cross-section duplicates', async () => {
  const pack = await load('assets/examples/ctxpack/contextpack.mvp.json');
  // Duplicate one item from templates into extras with a different id
  const tpl = pack.sections.find(s=>s.name==='templates').items[0];
  pack.sections.find(s=>s.name==='extras').items.push({ id: tpl.id + ':dup', content: tpl.content });
  const c = structuredClone(pack); delete c.hash; pack.hash = sha256Canonical(c);
  const { manifest } = await assemble(pack);
  const ptr = manifest.pointers.find(p => p.from_id === tpl.id + ':dup');
  assert.ok(ptr && ptr.to_id === tpl.id);
});

test('assemble: spans are merged to text and counted in metrics', async () => {
  const pack = await load('assets/examples/ctxpack/contextpack.mvp.json');
  // Replace first template item with spans
  const tplSec = pack.sections.find(s=>s.name==='templates');
  tplSec.items[0] = { id:'span.txt', spans:[{text:'AAA'},{text:'BBB'}] };
  const c = structuredClone(pack); delete c.hash; pack.hash = sha256Canonical(c);
  const { manifest } = await assemble(pack);
  const txt = manifest.sections.find(s=>s.name==='templates').items[0].text;
  assert.equal(txt, 'AAA\nBBB');
  assert.ok(manifest.metrics.merged_spans >= 1);
});
