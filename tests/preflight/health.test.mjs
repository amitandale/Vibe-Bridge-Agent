import test from 'node:test';
import assert from 'node:assert/strict';
import { probeHealth } from '../../lib/preflight/health.mjs';
import { mock, resetMocks } from '../_harness.mjs';

test('status mapping ok', { timeout: 15000 }, async () => {
  resetMocks();
  mock('http://svc/ok', { status: 200, body: JSON.stringify({ status: 'ok' }) });
  const r = await probeHealth('http://svc/ok', { timeoutMs: 50, retries: 0 });
  assert.equal(r.status, 'ok');
  assert.equal(r.httpStatus, 200);
});

test('status mapping degraded', { timeout: 15000 }, async () => {
  resetMocks();
  mock('http://svc/deg', { status: 200, body: JSON.stringify({ status: 'degraded' }) });
  const r = await probeHealth('http://svc/deg', { timeoutMs: 50, retries: 0 });
  assert.equal(r.status, 'degraded');
});

test('non-200 throws HEALTH_UNAVAILABLE', { timeout: 15000 }, async () => {
  resetMocks();
  mock('http://svc/500', { status: 500, body: 'err' });
  await assert.rejects(() => probeHealth('http://svc/500', { timeoutMs: 50, retries: 0 }), (e) => e.code === 'HEALTH_UNAVAILABLE');
});

test('timeout throws HEALTH_UNAVAILABLE', { timeout: 15000 }, async () => {
  // Override global fetch to never resolve
  const never = () => new Promise(()=>{});
  await assert.rejects(() => probeHealth('http://svc/never', { timeoutMs: 10, retries: 0, fetchImpl: never }), (e) => e.code === 'HEALTH_UNAVAILABLE');
});
