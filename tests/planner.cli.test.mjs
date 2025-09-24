import test from 'node:test';
import assert from 'node:assert/strict';
import { planPR } from '../lib/planner/index.mjs';
import { gate } from '../lib/ctxpack/enforce.mjs';

test('planner CLI-like build from example payload', () => {
  const payload = require('node:fs').readFileSync('assets/examples/planner/pr_small.json','utf8');
  const ex = JSON.parse(payload);
  const pack = planPR(ex);
  assert.doesNotThrow(()=>gate(pack,{mode:'enforce'}));
  const sections = Object.fromEntries(pack.sections.map(s=>[s.name,s.items.length]));
  assert.ok(sections.diff_slices >= 1);
});
