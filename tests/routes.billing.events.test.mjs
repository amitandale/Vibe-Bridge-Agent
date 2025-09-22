// tests/routes.billing.events.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function mkReq(url, headers={}){
  return new Request(url, { headers });
}

function signHex(secret, body=''){
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

test('events route rejects non-local without expose', async () => {
  const mod = await import('../app/api/billing/events/route.mjs');
  delete process.env.LLM_API_EXPOSE;
  const res = await mod.GET(mkReq('http://service/app/api/billing/events?limit=5', { 'x-forwarded-for': '8.8.8.8' }));
  assert.equal(res.status, 423);
});

test('events route requires HMAC', async () => {
  const mod = await import('../app/api/billing/events/route.mjs');
  const res = await mod.GET(mkReq('http://localhost/app/api/billing/events?limit=5'));
  assert.equal(res.status, 401);
});

test('events route ok with HMAC and returns array', async () => {
  const secret = 's1';
  process.env.VIBE_HMAC_SECRET = secret;
  const headers = {
    'x-vibe-kid': 'k1',                 // required by guard
    'x-signature': signHex(secret, ''), // guard signs empty body for GET
  };
  const mod = await import('../app/api/billing/events/route.mjs');
  const res = await mod.GET(mkReq('http://localhost/app/api/billing/events?limit=3', headers));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.events), true);
});
