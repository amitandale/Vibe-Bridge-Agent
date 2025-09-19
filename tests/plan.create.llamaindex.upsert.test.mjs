import test from 'node:test';
import assert from 'node:assert/strict';
import * as route from '../../app/api/plan/create/route.mjs';

test('plan create triggers best-effort llamaindex upsert when enabled', async () => {
  const prev = { ...process.env };
  process.env.LI_UPSERT_ON_PLAN = 'true';
  process.env.CI = 'true';
  process.env.LLAMAINDEX_URL = 'http://x';
  process.env.VENDOR_HMAC_PROJECT = 'projZ';
  process.env.VENDOR_HMAC_KID = 'kid1';
  process.env.VENDOR_HMAC_KEY = 'key1';

  let calls = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, _init) => {
    calls += 1;
    return { ok: true, status: 200, headers: new Map([['content-type','application/json']]), json: async () => ({ ok: true }) };
  };

  const mockReq = { json: async () => ({ projectId: 'projZ', title: 't', prompt: 'p', scope: [], tests: [], acceptance: [], changedFiles: [{ path: 'a', mime: 'text/plain', content: '' }] }) };
  const res = await route.POST(mockReq);
  assert.equal(res.status, 200);
  await new Promise(r => setTimeout(r, 10)); // allow fire-and-forget to schedule
  assert.equal(calls, 1);

  // restore
  globalThis.fetch = oldFetch;
  Object.assign(process.env, prev);
});
