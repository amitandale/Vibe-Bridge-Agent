// tests/preflight/health.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeHealth } from '../../lib/preflight/health.mjs';

function mkFetch({ status = 200, ok = true, body = { status: 'ok' }, delay = 0 }) {
  return async (url, { signal } = {}) => {
    await new Promise((r, j) => {
      const t = setTimeout(r, delay);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          j(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      }
    });
    return {
      ok,
      status,
      async json() { return body; }
    };
  };
}

test('status mapping ok', { timeout: 15000 }, async () => {
  const fetch = mkFetch({ body: { status: 'ok' } });
  const s = await probeHealth('http://x/health', { fetch });
  assert.strictEqual(s, 'ok');
});

test('status mapping degraded', { timeout: 15000 }, async () => {
  const fetch = mkFetch({ body: { status: 'degraded' } });
  const s = await probeHealth('http://x/health', { fetch });
  assert.strictEqual(s, 'degraded');
});

test('non-200 throws HEALTH_UNAVAILABLE', { timeout: 15000 }, async () => {
  const fetch = mkFetch({ status: 503, ok: false });
  await assert.rejects(
    () => probeHealth('http://x/health', { fetch }),
    /HEALTH_UNAVAILABLE/
  );
});

test('timeout throws HEALTH_UNAVAILABLE', { timeout: 15000 }, async () => {
  const fetch = mkFetch({ delay: 10_000 }); // large delay to trigger abort
  await assert.rejects(
    () => probeHealth('http://x/health', { fetch, timeoutMs: 50, retries: 0 }),
    /HEALTH_UNAVAILABLE/
  );
});
