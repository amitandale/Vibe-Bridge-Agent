import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHttp } from '../../lib/vendors/http.mjs';

test('retries once on 5xx and eventually succeeds with backoff', async () => {
  let calls = 0;
  const started = Date.now();
  const fakeFetch = async (_url, _init) => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 500,
        headers: new Map([['retry-after', '']]),
        text: async () => 'err'
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({ ok: true })
    };
  };

  const http = makeHttp({ baseUrl: '', projectId: 'p', kid: 'k', key: 's', fetchImpl: fakeFetch });
  const res = await http.post('/x', { body: 'a', timeoutMs: 2000 });
  const elapsed = Date.now() - started;
  assert.equal(res.ok, true);
  assert.equal(calls, 2);
  assert.ok(elapsed >= 200, `expected backoff >= 200ms, got ${elapsed}`);
  assert.ok(elapsed < 3000, `unexpectedly long delay ${elapsed}`);
});
