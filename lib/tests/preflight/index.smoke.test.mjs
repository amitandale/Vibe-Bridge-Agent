// tests/preflight/index.smoke.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPreflightSkeleton } from '../../lib/preflight/index.mjs';

function okFetch() {
  return async () => ({ ok: true, status: 200, async json() { return { status: 'ok' }; } });
}

test('happy path returns ok', { timeout: 15000 }, async () => {
  const endpoints = { services: [{ name: 'svc', schema_version: 'mcp.v1', version: '1.0.0', health_url: 'http://x/health' }] };
  const res = await runPreflightSkeleton({ endpoints, matrix: {}, fetch: okFetch() });
  assert.equal(res.ok, true);
  assert.equal(Array.isArray(res.warnings), true);
  assert.equal(res.details.services[0].status, 'ok');
});
