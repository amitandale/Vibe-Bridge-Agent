import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { POST as runAgent } from '../../app/api/run-agent/route.mjs';

test('run-agent: applies artifacts and enqueues executor', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ba-s2-'));
  // seed file to patch
  const target = path.join(projectRoot, 'lib/a.mjs');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'old\n', 'utf-8');

  // stub retrieve
  globalThis.__TEST_RETRIEVE__ = async (_ctx, q) => [{ id:'n1', path:'lib/a.mjs', text:'code snippet' }, { id:'n2', path:'README.md', text:'readme' }];

  // stub autogen
  globalThis.__TEST_AUTOGEN__ = {
    runAgents: async () => ({
      transcript: [{ role:'system', content:'done' }],
      artifacts: {
        patches: [{ path:'lib/a.mjs', diff:'--- a/lib/a.mjs\n+++ b/lib/a.mjs\n@@ -1,1 +1,1\n-old\n+new\n' }],
        tests: [{ path:'x/y/z.test.mjs', content:"import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('gen',()=>assert.ok(true));\n" }]
      }
    })
  };

  let called = 0, planSnap = null;
  globalThis.__BA_EXECUTOR__ = {
    execute: async (opts) => { called += 1; planSnap = opts?.plan; return { ok:true }; }
  };

  const req = new Request('http://local/api/run-agent', {
    method: 'POST',
    headers: { 'content-type':'application/json' },
    body: JSON.stringify({ projectRoot, messages:[{ role:'user', content:'do X' }] })
  });
  const res = await runAgent(req);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(typeof json.summary, 'string');

  // file patched
  const newContent = await fs.readFile(target,'utf-8');
  assert.equal(newContent, 'new\n');

  // test written under tests/generated
  const gen = path.join(projectRoot, 'tests/generated/x/y/z.test.mjs');
  const exists = await fs.readFile(gen, 'utf-8').then(()=>true).catch(()=>false);
  assert.equal(exists, true);

  assert.equal(called, 1);
  assert.equal(planSnap.kind, 'autogen');
});
