// tests/agents/run-agent.flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Import the route
import * as route from '../../app/api/run-agent/route.mjs';

function mkReq(body) {
  return new Request('http://localhost/app/api/run-agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('run-agent route applies patch, writes test, enqueues executor', async () => {
  // Prepare workspace
  const readme = path.join(process.cwd(), 'README.md');
  await fs.writeFile(readme, 'Old\n', 'utf8');

  // Mock AutoGen fetch via client
  const okPayload = {
    transcript: ['started', 'patched', 'tests written'],
    artifacts: {
      patches: [{ path: 'README.md', diff: '--- a/README.md\n+++ b/README.md\n@@\n-Old\n+New\n' }],
      tests: [{ path: 'tests/generated/sample.test.mjs', content: '/* ok */' }]
    }
  };
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(okPayload), { status: 200, headers: { 'content-type': 'application/json' } });

  // Capture enqueue
  let enqueued = null;
  globalThis.__onExecutorEnqueued = (payload) => { enqueued = payload; };

  try {
    const res = await route.POST(mkReq({ teamConfig: { t: 1 }, messages: [{ role: 'user', content: 'go' }] }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.ok(json.runId && typeof json.runId === 'string');
    assert.deepEqual(json.applied, { patches: 1, tests: 1 });

    const after = await fs.readFile(readme, 'utf8');
    assert.ok(after.includes('New'));

    const testFile = path.join(process.cwd(), 'tests/generated/sample.test.mjs');
    const tf = await fs.readFile(testFile, 'utf8');
    assert.ok(tf.includes('/* ok */'));

    assert.ok(enqueued && enqueued.plan && enqueued.plan.type === 'run-tests');
  } finally {
    globalThis.fetch = prevFetch;
    delete globalThis.__onExecutorEnqueued;
  }
});

test('run-agent route returns 400 on bad patch', async () => {
  // Prepare workspace
  const f = path.join(process.cwd(), 'CHANGELOG.md');
  await fs.writeFile(f, 'content stays\n', 'utf8');

  // Patch that cannot apply
  const badPayload = {
    transcript: ['bad'],
    artifacts: {
      patches: [{ path: 'CHANGELOG.md', diff: '--- a/CHANGELOG.md\n+++ b/CHANGELOG.md\n@@\n-DOES_NOT_EXIST\n+New\n' }],
      tests: []
    }
  };
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(badPayload), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    const res = await route.POST(mkReq({ teamConfig: {}, messages: [] }));
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.equal(json.code, 'BAD_REQUEST');
  } finally {
    globalThis.fetch = prevFetch;
  }
});
