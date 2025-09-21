// tests/vendors/autogen.contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import autogen from '../../lib/vendors/autogen.client.mjs';

function hmacHeaderUtf8(key, bodyObj) {
  const bodyStr = JSON.stringify(bodyObj);
  const hex = createHmac('sha256', Buffer.from(String(key ?? ''), 'utf8')).update(bodyStr, 'utf8').digest('hex');
  return 'sha256=' + hex;
}

test('autogen client signs headers, retries 429, returns artifacts', async () => {
  process.env.AUTOGEN_URL = 'https://autogen.example';
  process.env.VENDOR_HMAC_PROJECT = 'proj_123';
  process.env.VENDOR_HMAC_KID = 'kid_1';
  process.env.VENDOR_HMAC_KEY = 'secretkey123';
  delete process.env.AUTOGEN_TIMEOUT_MS;
  delete process.env.AUTOGEN_RETRIES;

  const calls = [];
  let attempt = 0;

  const okPayload = {
    transcript: ['ok'],
    artifacts: {
      patches: [{ path: 'README.md', diff: '--- a/README.md\n+++ b/README.md\n@@\n-Old\n+New\n' }],
      tests: [{ path: 'tests/generated/sample.test.mjs', content: '/* ok */' }]
    }
  };

  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (attempt++ === 0) {
      return new Response('too many', { status: 429, headers: { 'content-type': 'text/plain' } });
    }
    return new Response(JSON.stringify(okPayload), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const body = {
      teamConfig: { team: 'pair' },
      messages: [{ role: 'user', content: 'build' }],
      contextRefs: [{ path: 'docs/a.md', span: { start: 0, end: 10 }, snippet: '...' }],
      idempotencyKey: 'abc'
    };

    const res = await autogen.runAgents(body);

    // Structure assertions
    assert.deepEqual(res.transcript, ['ok']);
    assert.equal(res.artifacts.patches.length, 1);
    assert.equal(res.artifacts.tests.length, 1);

    // Request assertions
    assert.equal(calls.length, 2, 'should retry once after 429');
    const last = calls.at(-1);
    assert.equal(last.url, 'https://autogen.example/runAgents');
    assert.equal(last.init.method, 'POST');
    assert.equal(last.init.headers['content-type'], 'application/json');
    assert.equal(last.init.headers.accept, 'application/json');
    assert.equal(last.init.headers['x-vibe-project'], 'proj_123');
    assert.equal(last.init.headers['x-vibe-kid'], 'kid_1');
    assert.equal(last.init.headers['x-idempotency-key'], body.idempotencyKey);
    const expectedSig = hmacHeaderUtf8(process.env.VENDOR_HMAC_KEY, body);
    assert.equal(last.init.headers['x-signature'], expectedSig);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('autogen client maps timeout to UPSTREAM_UNAVAILABLE without flakiness', async () => {
  process.env.AUTOGEN_URL = 'https://autogen.example';
  process.env.VENDOR_HMAC_PROJECT = 'proj_123';
  process.env.VENDOR_HMAC_KID = 'kid_1';
  process.env.VENDOR_HMAC_KEY = 'secretkey123';
  process.env.AUTOGEN_TIMEOUT_MS = '50';
  process.env.AUTOGEN_RETRIES = '0';

  const prevFetch = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => new Promise((_, reject) => {
    const signal = init && init.signal;
    if (signal) {
      if (signal.aborted) return reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      const onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      signal.addEventListener('abort', onAbort, { once: true });
    }
    // never resolve; rely on abort
  });

  try {
    await assert.rejects(
      () => autogen.runAgents({ teamConfig: {}, messages: [], contextRefs: [], idempotencyKey: 't' }),
      (e) => e && e.code === 'UPSTREAM_UNAVAILABLE'
    );
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('autogen client maps 400 to BAD_REQUEST', async () => {
  process.env.AUTOGEN_URL = 'https://autogen.example';
  process.env.VENDOR_HMAC_PROJECT = 'proj_123';
  process.env.VENDOR_HMAC_KID = 'kid_1';
  process.env.VENDOR_HMAC_KEY = 'secretkey123';
  delete process.env.AUTOGEN_TIMEOUT_MS;
  delete process.env.AUTOGEN_RETRIES;

  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('bad', { status: 400, headers: { 'content-type': 'text/plain' } });

  try {
    await assert.rejects(
      () => autogen.runAgents({ teamConfig: {}, messages: [], contextRefs: [], idempotencyKey: 't' }),
      (e) => e && e.code === 'BAD_REQUEST'
    );
  } finally {
    globalThis.fetch = prevFetch;
  }
});
