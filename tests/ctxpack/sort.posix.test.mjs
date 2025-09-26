import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { assemble } from '../../lib/ctxpack/assemble.mjs';
import { sha256Canonical } from '../../lib/ctxpack/hash.mjs';

async function loadDraft() {
  const raw = await fs.readFile(new URL('../../fixtures/ctxpack/draft.sort.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

test('POSIX path normalization and stable sort are deterministic', { timeout: 15000 }, async () => {
  const draft = await loadDraft();

  const toPosix = p => {
    if (!p) return '';
    let s = String(p).replace(/^[A-Za-z]:[\\/]+/, '');
    s = s.replace(/\\+/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/');
    if (s.length > 1) s = s.replace(/\/+$/, '');
    return s;
  };

  const items = draft.sections[0].items;
  const expected = items.map(it => ({...it, path: toPosix(it.path || it.id || '')}))
    .sort((a,b)=>{
      const pa=a.path,pb=b.path;
      if (pa!==pb) return pa < pb ? -1 : 1;
      const sa = Number.isFinite(Number(a.start_line)) ? Number(a.start_line) : Infinity;
      const sb = Number.isFinite(Number(b.start_line)) ? Number(b.start_line) : Infinity;
      if (sa!==sb) return sa - sb;
      const ya = a.symbol ?? '';
      const yb = b.symbol ?? '';
      const yAEmpty = ya === '';
      const yBEmpty = yb === '';
      if (yAEmpty !== yBEmpty) return yAEmpty ? 1 : -1;
      if (ya<yb) return -1;
      if (ya>yb) return 1;
      return 0;
    })
    .map(it => it.id);

  // Prepare pack hash
  const clone = JSON.parse(JSON.stringify(draft));
  delete clone.hash;
  draft.hash = sha256Canonical(clone);

  // First run with original order
  const m1 = await assemble(draft, { model: 'default' });
  const sec1 = m1.sections.find(s => s.name === 'diff_slices');
  assert.ok(sec1 && Array.isArray(sec1.items), 'diff_slices present');
  const ids1 = sec1.items.map(x => x.id);
  assert.deepEqual(ids1, expected, 'items are sorted deterministically');
  assert.ok(sec1.items.every(x => !String(x.path||'').includes('\\')), 'paths normalized to POSIX');

  // Second run with shuffled inputs
  const draft2 = JSON.parse(JSON.stringify(draft));
  const sec = draft2.sections.find(s => s.name === 'diff_slices');
  sec.items = shuffle(sec.items);
  const clone2 = JSON.parse(JSON.stringify(draft2)); delete clone2.hash; draft2.hash = sha256Canonical(clone2);

  const m2 = await assemble(draft2, { model: 'default' });
  const sec2 = m2.sections.find(s => s.name === 'diff_slices');
  const ids2 = sec2.items.map(x => x.id);
  assert.deepEqual(ids2, expected, 'shuffled inputs still produce same order');
});
