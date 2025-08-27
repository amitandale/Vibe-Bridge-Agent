// tests/migrate-status.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __reset as resetState } from '../lib/migrate/state.mjs';
import * as route from '../lib/routes/migrate-status.mjs';

test('migrate-status reports SUCCESS without DB', async () => {
  resetState();
  delete process.env.DATABASE_URL;
  const res = await route.GET(new Request('http://agent/migrate-status', { method:'GET' }));
  const j = JSON.parse(await res.text());
  assert.equal(j.ok, true);
  assert.equal(j.status, 'SUCCESS');
  assert.equal(j.applied, 0);
});

test('migrate-status reports applied when DATABASE_URL set', async () => {
  resetState();
  process.env.DATABASE_URL = 'postgres://u:p@h/db';
  const res = await route.GET(new Request('http://agent/migrate-status', { method:'GET' }));
  const j = JSON.parse(await res.text());
  assert.equal(j.ok, true);
  assert.equal(j.status, 'SUCCESS');
  assert.equal(j.applied, 1);
});
