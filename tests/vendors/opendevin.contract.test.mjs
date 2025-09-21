// tests/vendors/opendevin.contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

function queueFetch(responses){
  let i = 0;
  return async (url, init) => {
    const r = responses[i++] || responses[responses.length-1];
    if (typeof r === 'function') return r(url, init);
    return r;
  };
}

function jsonResponse(obj, { status=200, headers={} } = {}){
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('signs requests, honors idempotency, parses outputs', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ prNumber: 42, branchUrl: 'b', htmlUrl: 'h' });
  };
  const mod = await import('../../lib/vendors/opendevin.client.mjs');
  process.env.OPENDEVIN_URL = 'https://od.example';
  process.env.VENDOR_HMAC_PROJECT = 'proj';
  process.env.VENDOR_HMAC_KID = 'kid';
  process.env.VENDOR_HMAC_KEY = 'secret';

  const pr = await mod.preparePr({ owner:'o', repo:'r', base:'main', branch:'feat/x', title:'t', body:'b', labels:['vibe'] }, { fetchImpl: fetch, idempotencyKey: 'abc' });
  assert.equal(pr.prNumber, 42);
  assert.equal(pr.branchUrl, 'b');
  assert.equal(pr.htmlUrl, 'h');

  assert.equal(calls.length, 1);
  const req = calls[0];
  assert.ok(String(req.url).endsWith('/github/prepare_pr'));
  const h = req.init.headers;
  assert.equal(h['x-vibe-project'], 'proj');
  assert.equal(h['x-vibe-kid'], 'kid');
  assert.equal(typeof h['x-signature'], 'string');
  assert.ok(h['x-signature'].startsWith('sha256='));
  assert.equal(h['x-idempotency-key'], 'abc');
});

test('retries on 429 then succeeds; honors Retry-After', async () => {
  // No global timer patching. Use Retry-After: 0 to avoid long waits.
  const fetch = queueFetch([
    new Response('', { status: 429, headers: { 'retry-after': '0' } }),
    jsonResponse({ stdout:'ok', stderr:'', exitCode:0, durationMs:5 })
  ]);
  const mod = await import('../../lib/vendors/opendevin.client.mjs');
  const run = await mod.exec({ cwd:'/w', shell:'bash', commands:['echo ok'], env:{}, timeoutMs: 5000 }, { fetchImpl: fetch });
  assert.equal(run.exitCode, 0);
  assert.equal(run.stdout, 'ok');
});

test('maps errors to taxonomy-like codes', async () => {
  for (const status of [401,403,404,429,500]){
    const fetch = async () => new Response('x', { status });
    const mod = await import('../../lib/vendors/opendevin.client.mjs');
    let threw = false;
    try {
      await mod.preparePr({ owner:'o', repo:'r', base:'m', branch:'b' }, { fetchImpl: fetch });
    } catch (e){
      threw = true;
      assert.equal(e.status, status);
      assert.ok(['UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','RATE_LIMITED','UPSTREAM_UNAVAILABLE','INTERNAL'].includes(e.code));
    }
    assert.equal(threw, true);
  }
});

test('respects timeout', async () => {
  const fetch = async () => new Promise(()=>{}); // never resolves
  const mod = await import('../../lib/vendors/opendevin.client.mjs');
  let threw = false;
  const t0 = Date.now();
  try {
    await mod.exec({ cwd:'/w', shell:'bash', commands:['sleep'], env:{}, timeoutMs: 50 }, { fetchImpl: fetch });
  } catch (e){
    threw = true;
  }
  assert.equal(threw, true);
  assert.ok(Date.now() - t0 < 2000); // aborted quickly
});
