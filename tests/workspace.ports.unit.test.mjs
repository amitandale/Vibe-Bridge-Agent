// tests/workspace.ports.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePorts, composeProjectName, portConflict } from '../lib/workspace/ports.mjs';

test('normalizePorts dedupes and filters', () => {
  const out = normalizePorts('80, 80, 0, 70000, 443, 5432');
  assert.deepEqual(out.sort((a,b)=>a-b), [80,443,5432]);
});

test('composeProjectName formats correctly', () => {
  assert.equal(composeProjectName('p1','ci'), 'p1-ci');
});

test('portConflict returns actionable hint', () => {
  const r = portConflict(54322, { proc:'docker-proxy', compose_project:'supabase-ci' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_PORT_CONFLICT');
  assert.equal(r.details.port, 54322);
  assert.ok(r.hint.includes('supabase-ci'));
});
