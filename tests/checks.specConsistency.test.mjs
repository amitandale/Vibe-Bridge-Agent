import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSpecConsistencyCheck } from '../lib/checks/specConsistency.mjs';

test('spec-consistency: pass shape', async () => {
  const r = await runSpecConsistencyCheck({ owner:'acme', repo:'app', spec:'OK', plan:'OK' });
  assert.equal(r.ok, true);
  assert.equal(r.name, 'vibe/spec-consistency');
  assert.deepEqual(Object.keys(r.output).sort(), ['summary','title']);
  assert.equal(r.output.title.includes('Consistent'), true);
});

test('spec-consistency: fail aggregates messages', async () => {
  const r = await runSpecConsistencyCheck({ owner:'acme', repo:'app', spec:'FAIL here', plan:'OK' });
  assert.equal(r.ok, false);
  assert.equal(r.output.title.includes('Inconsistency'), true);
  assert.equal(/Spec: /.test(r.output.summary), true);
});
