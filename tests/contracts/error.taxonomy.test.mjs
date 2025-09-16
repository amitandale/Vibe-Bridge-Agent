// tests/contracts/error.taxonomy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as gcp from '../../lib/providers/gcp.mjs';

test('gcp adapter maps status to provider error taxonomy', async () => {
  const mkRes = (status, body) => ({ ok: status>=200 && status<300, status, json: async () => body, text: async ()=>'t' });

  await assert.rejects(
    gcp.deploy({ repo:'r', framework:'f', fetchImpl: async () => mkRes(401, { message:'no' }) }),
    (e) => String(e.code||e.message).includes('PROVIDER_FORBIDDEN') || String(e).includes('PROVIDER_FORBIDDEN')
  );

  await assert.rejects(
    gcp.deploy({ repo:'r', framework:'f', fetchImpl: async () => mkRes(429, {}) }),
    (e) => String(e.code||e.message).includes('PROVIDER_RATE_LIMIT') || String(e).includes('PROVIDER_RATE_LIMIT')
  );

  await assert.rejects(
    gcp.deploy({ repo:'r', framework:'f', fetchImpl: async () => mkRes(500, {}) }),
    (e) => String(e.code||e.message).includes('PROVIDER_RETRY') || String(e).includes('PROVIDER_RETRY')
  );
});
