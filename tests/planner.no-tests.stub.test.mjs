import test from 'node:test';
import assert from 'node:assert/strict';
import { planFromSignals } from '../lib/planner/index.mjs';

test('adds no-tests-found stub and provenance when no tests link', () => {
  const diff = 'diff --git a/lib/core/util.mjs b/lib/core/util.mjs\n+export const z=1;\n';
  const { sections, provenance } = planFromSignals({ diff, labels:[] });
  const contracts = sections.find(s=>s.name==='contracts').items.map(i=>i.id);
  assert.ok(contracts.includes('contracts/no-tests-found.stub'));
  const reasons = (provenance||[]).map(p=>p.reason).filter(Boolean);
  assert.ok(reasons.includes('no_tests_found'));
});
