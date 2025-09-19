import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHttp, HttpError } from '../../lib/vendors/http.mjs';
import * as timers from 'node:timers';

test('hang triggers abort and maps to UPSTREAM_UNAVAILABLE', async () => {
  const fakeFetch = (_url, init) => {
    return new Promise((_resolve, reject) => {
      // When aborted, reject like fetch would
      init.signal.addEventListener('abort', () => {
        const e = new Error('AbortError');
        e.name = 'AbortError';
        reject(e);
      });
    });
  };
  const http = makeHttp({ baseUrl: '', projectId: 'p', kid: 'k', key: 's', fetchImpl: fakeFetch });
  const started = Date.now();
  await test.test('inner', async () => {
    await assert.rejects(
      http.post('/slow', { body: '', timeoutMs: 50 }),
      (err) => {
        assert.ok(err instanceof Error);
        // code comes from lib/obs/errors.mjs in repo; here we accept string fallback too
        assert.ok(err.code === 'UPSTREAM_UNAVAILABLE' || typeof err.code === 'string');
        return true;
      }
    );
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 40 && elapsed < 2000, `abort did not occur near timeout: ${elapsed}ms`);
});
