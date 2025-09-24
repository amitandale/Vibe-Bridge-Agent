import test from 'node:test';
import assert from 'node:assert/strict';
import { emitFromArtifacts } from '../lib/ctxpack/emit.mjs';
import { gate } from '../lib/ctxpack/enforce.mjs';

test('emit: artifacts route to sections and pass gate', () => {
  const artifacts = [
    { path: 'tests/a.test.mjs', content: 't' },
    { path: 'lib/x.mjs', content: 'x' },
    { path: 'README.md', content: 'r' }
  ];
  const p = emitFromArtifacts({ projectId:'demo', pr:{id:'1', branch:'work', commit_sha:'deadbee'}, artifacts });
  assert.doesNotThrow(()=>gate(p,{mode:'enforce'}));
  const map = Object.fromEntries(p.sections.map(s=>[s.name, s.items.length]));
  assert.equal(map.linked_tests, 1);
  assert.equal(map.diff_slices, 1);
  assert.equal(map.extras, 1);
});

test('gate warn mode aggregates warnings and does not throw', () => {
  const p = emitFromArtifacts({ projectId:'demo', pr:{id:'1', branch:'work', commit_sha:'deadbee'}, artifacts: [] });
  // Damage the hash
  p.hash = '0'.repeat(64);
  const res = gate(p, { mode: 'warn' });
  assert.equal(res.ok, false);
  assert.ok(res.warnings.length >= 1);
});
