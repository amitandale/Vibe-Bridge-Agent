import test from 'node:test';
import assert from 'node:assert/strict';
import { gate } from '../lib/ctxpack/enforce.mjs';

test('planner CLI-like build from example payload', async (t) => {
  // Lazy import so missing planner does not create async errors after test end.
  let planPR;
  try {
    ({ planPR } = await import('../lib/planner/index.mjs'));
  } catch (e) {
    t.diagnostic('planner module missing; skipping CLI-like test');
    t.skip('planner not present');
    return;
  }
  const fs = await import('node:fs/promises');
  const payload = await fs.readFile('assets/examples/planner/pr_small.json','utf8');
  const ex = JSON.parse(payload);
  const pack = planPR(ex);
  assert.doesNotThrow(()=>gate(pack,{mode:'enforce'}));
  const sections = Object.fromEntries(pack.sections.map(s=>[s.name,s.items.length]));
  assert.ok(sections.diff_slices >= 1);
});
