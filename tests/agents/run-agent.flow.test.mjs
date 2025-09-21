import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../../app/api/run-agent/route.mjs';

function mkResponse(status, json) {
  return {
    status,
    async json() { return json; },
  };
}

test('route integrates client and applies artifacts then enqueues executor', async () => {
  // Mock vendor HTTP
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const vendorJson = {
      transcript: [],
      artifacts: {
        patches: [{ path: 'tmp.generated.txt', diff: '<<FULL>>hello' }],
        tests: [{ path: 'tests/generated/sample.test.mjs', content: 'export const ok = true;' }],
      }
    };
    return mkResponse(200, vendorJson);
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
});

test('bad patch returns 400', async () => {
  globalThis.fetch = async (_url, init) => {
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
    globalThis.fetch = __origFetch;
    globalThis.__onExecutorEnqueued = __origEnqueue;
  }
} finally {
    globalThis.fetch = __origFetch;
    globalThis.__onExecutorEnqueued = __origEnqueue;
  }
});