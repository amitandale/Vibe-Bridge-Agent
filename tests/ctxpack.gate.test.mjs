import test from 'node:test';
import assert from 'node:assert/strict';
import { gate } from '../lib/ctxpack/enforce.mjs';
import { sha256Canonical } from '../lib/ctxpack/hash.mjs';

function base() {
  function seal(p) {
    const c = structuredClone(p); delete c.hash;
    p.hash = sha256Canonical(c);
    return p;
  }

  const p = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'deadbee' },
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 999999, max_files: 10, max_per_file_tokens: 99999,
      section_caps: {templates:2,spec_canvas:2,diff_slices:4,linked_tests:4,contracts:4,extras:4}},
    sections: [
      { name:'templates', items:[{id:'t1', path:'prompts/base.txt'}] },
      { name:'spec_canvas', items:[] },
      { name:'diff_slices', items:[{id:'d1', path:'lib/x.mjs'}] },
      { name:'linked_tests', items:[] },
      { name:'contracts', items:[] },
      { name:'extras', items:[] },
    ],
    must_include: [], nice_to_have: [], never_include: [], provenance: []
  };
  const clone = structuredClone(p);
  clone.hash = sha256Canonical(clone);
  return clone;
}

test('gate passes valid pack', () => {
  const p = base();
  assert.doesNotThrow(()=>gate(p, {mode:'enforce'}));
});

test('gate fails on hash mismatch', () => {
  const p = base(); p.hash = '0'.repeat(64);
  assert.throws(()=>gate(p,{mode:'enforce'}), /HASH_MISMATCH/);
});

test('gate fails on order violation', () => {
  const p = base();
  p.sections = [{name:'diff_slices', items:[]}, ...p.sections.filter(s=>s.name!=='diff_slices')];
  assert.throws(()=>gate(p,{mode:'enforce'}), /ORDER_VIOLATION/);
});

test('gate fails when section caps exceeded', () => {
  const p = base();
  p.sections.find(s=>s.name==='diff_slices').items = new Array(10).fill(0).map((_,i)=>({id:`d${i}`, path:`lib/x${i}.mjs`}));
  assert.throws(()=>gate(p,{mode:'enforce'}), /SECTION_CAP_EXCEEDED/);
});

test('gate fails on never_include', () => {
  const p = base();
  p.never_include = ['**/*.mjs'];
  assert.throws(()=>gate(p,{mode:'enforce'}), /NEVER_INCLUDE_MATCH/);
});
