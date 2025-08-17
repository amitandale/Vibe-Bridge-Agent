import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// target
import * as initRoute from '../app/api/init-repo/route.js';
import * as recRoute from '../app/api/helpers/reconcile/route.js';

function sign(body, secret){
  const raw = JSON.stringify(body);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return { raw, sig };
}

test('init-repo: rejects when signature missing', async () => {
  const body = { owner: 'acme', repoName: 'demo' };
  const req = new Request('http://x/init', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const res = await initRoute.POST(req);
  assert.equal(res.status, 401);
  const j = await res.json();
  assert.equal(j.ok, false);
});

test('init-repo: accepts with valid HMAC and returns repoUrl', async () => {
  process.env.BRIDGE_SECRET = 's3cr3t';
  const body = { owner: 'acme', repoName: 'demo' };
  const { raw, sig } = sign(body, process.env.BRIDGE_SECRET);
  const req = new Request('http://x/init', { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-signature': sig } });
  const res = await initRoute.POST(req);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.match(j.repoUrl, /^https:\/\/github.com\//);
});

test('helpers/reconcile returns ok', async () => {
  const req = new Request('http://x/reconcile', { method: 'POST', body: JSON.stringify({ owner:'acme', repo:'demo', prNumber: 1 }), headers: { 'content-type':'application/json' } });
  const res = await recRoute.POST(req);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
});
