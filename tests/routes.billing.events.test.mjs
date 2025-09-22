// tests/routes.billing.events.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { _clearStore, _seed, sign } from '../lib/security/hmac.mjs';

function mkReq(url, headers={}){
  return new Request(url, { headers });
}

test('events route rejects non-local without expose', async () => {
  const mod = await import('../app/api/billing/events/route.mjs');
  const res = await mod.GET(mkReq('http://service/app/api/billing/events?limit=5', { 'x-forwarded-for': '8.8.8.8' }));
  assert.equal(res.status, 423);
});

test('events route requires HMAC', async () => {
  const mod = await import('../app/api/billing/events/route.mjs');
  const res = await mod.GET(mkReq('http://localhost/app/api/billing/events?limit=5'));
  assert.equal(res.status, 401);
});

test('events route ok with HMAC and returns array', async () => {
  _clearStore();
  _seed({ projectId: 'p1', kid: 'k1', key: 's1' });
  const headers = {
    'x-vibe-project': 'p1',
    'x-vibe-kid': 'k1',
    'x-signature': sign(Buffer.from(''), 's1'),
  };
  const mod = await import('../app/api/billing/events/route.mjs');
  const res = await mod.GET(mkReq('http://localhost/app/api/billing/events?limit=3', headers));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.events), true);
});
