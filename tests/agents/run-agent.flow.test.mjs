// tests/agents/run-agent.flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Helper to make a Request with headers
function makeReq(url, method, headers, bodyObj) {
  const init = {
    method,
    headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
    body: JSON.stringify(bodyObj || {})
  };
  return new Request(url, init);
}

test('POST /api/run-agent applies patch, writes test, enqueues executor', async () => {
  // Prepare temp workspace
  const dir = await fs.mkdtemp(join(tmpdir(), 'run-agent-'));
  const targetFile = join(dir, 'README.md');
  await fs.writeFile(targetFile, '# Start\n', 'utf8');

  // Prepare a unified diff that modifies README.md
  const diff = [
    'diff --git a/README.md b/README.md',
    'index e69de29..b6fc4c6 100644',
    '--- a/README.md',
    '+++ b/README.md',
    '@@ -1,1 +1,2 @@',
    '-# Start',
    '+# Start',
    '+More',
    ''
  ].join('\n');

  // Mock vendor call
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    if (String(url).includes('autogen')) {
      const payload = JSON.parse(init.body);
      // basic echo sanity
      assert.ok(payload?.idempotencyKey, 'idempotencyKey present');
      return new Response(JSON.stringify({
        transcript: ['ok'],
        artifacts: {
          patches: [{ diff }],
          tests: [{ path: 'smoke/ok.test.mjs', content: 'export default {};\n' }]
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('', { status: 404 });
  };

  // Hook executor enqueue
  let enqueued = null;
  globalThis.__onExecutorEnqueued = (p) => { enqueued = p; };

  // Set vendor env
  process.env.AUTOGEN_URL = 'https://autogen.example';
  process.env.VENDOR_HMAC_PROJECT = 'proj';
  process.env.VENDOR_HMAC_KID = 'kid';
  process.env.VENDOR_HMAC_KEY = 'key';

  // Import route
  const mod = await import('../../app/api/run-agent/route.mjs');

  const req = makeReq('http://local/api/run-agent', 'POST', {
    'x-signature': 'sha256=' + '0'.repeat(64),
    'x-vibe-ticket': 'tkn'
  }, {
    teamConfig: { team: 'pair' },
    messages: [{ role: 'user', content: 'build' }],
    projectRoot: dir
  });

  const res = await mod.POST(req);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.applied.patches, 1);
  assert.equal(json.applied.tests, 1);
  assert.ok(json.runId);

  // Patch applied
  const content = await fs.readFile(targetFile, 'utf8');
  assert.ok(content.includes('More'), 'patch result applied');

  // Test file created
  const genTest = join(dir, 'tests', 'generated', 'smoke', 'ok.test.mjs');
  const exists = await fs.readFile(genTest, 'utf8').then(() => true).catch(() => false);
  assert.equal(exists, true, 'generated test exists');

  // Executor enqueued once
  assert.ok(enqueued && enqueued.plan && enqueued.plan.type === 'run-tests', 'executor enqueued');

  // Cleanup
  globalThis.fetch = originalFetch;
  delete globalThis.__onExecutorEnqueued;
});

test('bad patch returns 400 BAD_REQUEST', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'run-agent-bad-'));
  await fs.writeFile(join(dir, 'x.txt'), 'hello\n', 'utf8');

  // Diff that mismatches context on purpose
  const badDiff = [
    'diff --git a/x.txt b/x.txt',
    'index 1111111..2222222 100644',
    '--- a/x.txt',
    '+++ b/x.txt',
    '@@ -1,1 +1,1 @@',
    '-bye',
    '+ciao',
    ''
  ].join('\n');

  // Mock vendor
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('autogen')) {
      return new Response(JSON.stringify({
        transcript: ['ok'],
        artifacts: { patches: [{ diff: badDiff }], tests: [] }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('', { status: 404 });
  };

  const mod = await import('../../app/api/run-agent/route.mjs');
  const req = new Request('http://local/api/run-agent', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': 'sha256=' + '0'.repeat(64),
      'x-vibe-ticket': 'tkn'
    },
    body: JSON.stringify({ teamConfig:{}, messages:[], projectRoot: dir })
  });

  const res = await mod.POST(req);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.code, 'BAD_REQUEST');

  globalThis.fetch = originalFetch;
});
