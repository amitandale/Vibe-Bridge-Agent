import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../../app/api/run-agent/route.mjs';
import { unlink, rm } from 'node:fs/promises';

function mkResponse(status, json) {
  return { status, async json() { return json; } };
}

test('route integrates client and applies artifacts then enqueues executor', async () => {
  const origFetch = globalThis.fetch;
  const origEnqueue = globalThis.__onExecutorEnqueued;
  try {
    let calls = 0;
    globalThis.fetch = async (_url, _init) => {
      calls++;
      return mkResponse(200, {
        transcript: [],
        artifacts: {
          patches: [{ path: 'tmp.generated.txt', diff: '<<FULL>>hello' }],
          // Important: do not create a *.test.mjs to avoid discovery
          tests: [{ path: 'tests/generated/sample.mjs', content: 'export const ok = true;' }],
        },
      });
    };

    let enqueued = null;
    globalThis.__onExecutorEnqueued = (p) => { enqueued = p; };

    const req = new Request('http://local/app/api/run-agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamConfig: { a: 1 }, messages: [{ role: 'user', content: 'hi' }] }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.runId);
    assert.equal(body.applied.patches, 1);
    assert.equal(body.applied.tests, 1);
    assert.equal(calls, 1);
    assert.ok(enqueued);
  } finally {
    // Cleanup artifacts and restore globals
    try { await unlink('tmp.generated.txt'); } catch {}
    try { await rm('tests/generated', { recursive: true, force: true }); } catch {}
    globalThis.fetch = origFetch;
    globalThis.__onExecutorEnqueued = origEnqueue;
  }
});

test('bad patch returns 400', async () => {
  const origFetch = globalThis.fetch;
  const origEnqueue = globalThis.__onExecutorEnqueued;
  try {
    globalThis.__onExecutorEnqueued = () => {};

    globalThis.fetch = async (_url, _init) => {
      return mkResponse(200, {
        transcript: [],
        artifacts: { patches: [{ path: 'tmp.bad.txt', diff: '<<BAD>>' }], tests: [] },
      });
    };

    const req = new Request('http://local/app/api/run-agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamConfig: {}, messages: [] }),
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
  } finally {
    try { await unlink('tmp.bad.txt'); } catch {}
    globalThis.fetch = origFetch;
    globalThis.__onExecutorEnqueued = origEnqueue;
  }
});
