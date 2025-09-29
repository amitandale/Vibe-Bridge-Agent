import test from 'node:test';
import assert from 'node:assert/strict';
import { runPreflight } from '../../lib/preflight/index.mjs';
import { mock, resetMocks } from '../_harness.mjs';
import endpoints from '../../fixtures/preflight/endpoints.json' assert { type: 'json' };

test('smoke: ok with healthy services', { timeout: 15000 }, async () => {
  resetMocks();
  for (const [name, svc] of Object.entries(endpoints.services)){
    mock(svc.url, { status: 200, body: JSON.stringify({ status: 'ok' }) });
  }
  const r = await runPreflight({
    endpoints,
    compatMatrix: { minVersions: { llamaindex: '1.0.0', tools: '0.9.0' } },
    enforce: false,
    timeoutMs: 50
  });
  assert.equal(r.ok, true);
  assert.equal(Array.isArray(r.warnings), true);
  assert.equal(typeof r.details, 'object');
});
