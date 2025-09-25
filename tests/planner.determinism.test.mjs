import test from 'node:test';
import assert from 'node:assert/strict';
import { planPR } from '../lib/planner/index.mjs';
import { gate } from '../lib/ctxpack/enforce.mjs';

test('planner determinism: same inputs yield same hash and structure', async (t) => {
  const inputs = {
    projectId: 'demo',
    pr: { id: '42', branch: 'work', commit_sha: 'deadbee' },
    mode: 'PR',
    labels: ['api','ui'],
    diff: 'diff --git a/lib/a.mjs b/lib/a.mjs\n--- a/lib/a.mjs\n+++ b/lib/a.mjs\n@@ -0,0 +1,1 @@\n+export function a(){}\n',
    fileContents: { 'lib/a.mjs': 'export function a(){}\n' }
  };
  const p1 = planPR(inputs);
  const p2 = planPR(inputs);
  assert.deepEqual(p1, p2);
  assert.equal(p1.hash, p2.hash);
  assert.doesNotThrow(()=>gate(p1,{mode:'enforce'}));
});
