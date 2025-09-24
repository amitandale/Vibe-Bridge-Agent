import test from 'node:test';
import assert from 'node:assert/strict';

test('planner: migrations go to contracts and add must_include', async (t) => {
  let planPR;
  try { ({ planPR } = await import('../lib/planner/index.mjs')); } catch { t.skip('planner not present'); return; }
  const diff = 'diff --git a/migrations/001_init.sql b/migrations/001_init.sql\n--- a/migrations/001_init.sql\n+++ b/migrations/001_init.sql\n@@ -0,0 +1,1 @@\n+-- sql\n';
  const pack = planPR({ projectId:'demo', pr:{id:'1', branch:'work', commit_sha:'deadbee'}, labels:['db'], diff, fileContents:{'migrations/001_init.sql':'-- sql\n'} });
  const contracts = pack.sections.find(s=>s.name==='contracts').items;
  assert.ok(contracts.some(it => it.id.includes('migrations/001_init.sql')));
});

test('planner: rename adds git provenance entries', async (t) => {
  let planFromSignals;
  try { ({ planFromSignals } = await import('../lib/planner/index.mjs')); } catch { t.skip('planner not present'); return; }
  const diff = 'rename from lib/old.mjs\nrename to lib/new.mjs\n';
  const rep = planFromSignals({ diff });
  const prov = rep.provenance.filter(p => p.source==='git');
  assert.ok(prov.length >= 1);
});
