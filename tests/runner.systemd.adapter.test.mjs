// tests/runner.systemd.adapter.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { listLocal } from '../lib/runner/systemd.adapter.mjs';

test('systemd.listLocal parses unit rows', async () => {
  const now = Math.floor(Date.now()/1000);
  const out = [
    'github-runner@p1-ci.service            loaded active running GitHub Runner',
    'github-runner@projX-staging.service    loaded inactive dead    GitHub Runner',
    ''
  ].join('\n');
  const exec = async (cmd, args) => out;
  const rows = await listLocal({ exec });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].name, 'p1-ci');
  assert.equal(rows[0].state, 'active');
  assert.equal(rows[1].lane, 'staging');
  assert.ok(rows[0].lastSeenEpochS >= now);
});
