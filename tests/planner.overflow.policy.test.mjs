import test from 'node:test';
import assert from 'node:assert/strict';
import { planFromSignals } from '../lib/planner/index.mjs';

test('global overflow never drops contracts or diff_slices', () => {
  const head = 'diff --git a/db/migrations/001.sql b/db/migrations/001.sql\n'
             + '--- a/db/migrations/001.sql\n'
             + '+++ b/db/migrations/001.sql\n'
             + '@@ -0,0 +1 @@\n'
             + '+CREATE TABLE x (id int);\n';
  const tail = Array.from({length:80},(_,i)=>(
    `diff --git a/lib/a${i}.mjs b/lib/a${i}.mjs\n`
  + `--- a/lib/a${i}.mjs\n`
  + `+++ b/lib/a${i}.mjs\n`
  + `@@ -0,0 +1 @@\n`
  + `+export const x${i}=1;\n`
  )).join('');
  const diff = head + tail;
  const fileContents = Object.fromEntries(Array.from({length:80},(_,i)=>[`lib/a${i}.mjs`,`export const x${i}=1;`]));
  const { sections, omissions } = planFromSignals({ labels:['api'], diff, fileContents });
  const counts = Object.fromEntries(sections.map(s=>[s.name, s.items.length]));
  assert.ok(counts.contracts >= 1, 'contracts must remain');
  assert.ok(counts.diff_slices >= 1, 'diff_slices must remain');
  assert.ok((omissions||[]).every(o => o.section !== 'contracts' && o.section !== 'diff_slices'));
});
