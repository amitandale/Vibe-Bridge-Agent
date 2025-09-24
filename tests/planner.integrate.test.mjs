import test from 'node:test';
import assert from 'node:assert/strict';
import { gate } from '../lib/ctxpack/enforce.mjs';

test('planner integration: pack validates and includes diff slices', async (t) => {
  let planPR;
  try {
    ({ planPR } = await import('../lib/planner/index.mjs'));
  } catch (e) {
    t.diagnostic('planner module missing; skipping integration test');
    t.skip('planner not present');
    return;
  }
  const diff = 'diff --git a/lib/a.mjs b/lib/a.mjs\n--- a/lib/a.mjs\n+++ b/lib/a.mjs\n@@ -0,0 +1,1 @@\n+export function a(){}\n';
  const pack = planPR({ projectId:'demo', pr:{id:'1', branch:'work', commit_sha:'deadbee'}, labels:['ui'], diff, fileContents:{'lib/a.mjs':'export function a(){}\n'} });
  assert.doesNotThrow(()=>gate(pack,{mode:'enforce'}));
  const ds = pack.sections.find(s=>s.name==='diff_slices').items;
  assert.ok(ds.length >= 1);
});
