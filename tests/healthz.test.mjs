// tests/healthz.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __reset as resetState } from '../lib/migrate/state.mjs';
import * as route from '../lib/routes/healthz.mjs';

test('healthz returns ready without DB', async () => {
  resetState();
  delete process.env.DATABASE_URL;
  const res = await route.GET(new Request('http://agent/healthz', { method:'GET' }));
  assert.equal(res.status, 200);
  const j = JSON.parse(await res.text());
  assert.equal(j.ok, true);
  assert.equal(j.status, 'ready');
  assert.ok(!('db' in j));
});

test('healthz returns db:true when DATABASE_URL set', async () => {
  resetState();
  process.env.DATABASE_URL = 'postgres://u:p@h/db';
  const res = await route.GET(new Request('http://agent/healthz', { method:'GET' }));
  const j = JSON.parse(await res.text());
  assert.equal(j.db, true);
});
