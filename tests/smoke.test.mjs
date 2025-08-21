// tests/smoke.test.mjs
import { test } from 'node:test';
import { assert, mock, resetMocks, getEnv, withFakeNow, sleep } from './_harness.mjs';

test('smoke: harness + profile awareness', async () => {
  // profile presence (serverless|longrun) but don't require it
  const profile = process.env.PROFILE || 'serverless';
  assert.ok(profile === 'serverless' || profile === 'longrun');

  // mock fetch
  resetMocks();
  mock('https://api.test/ok', { body: JSON.stringify({ ok: true }) });
  const r = await fetch('https://api.test/ok');
  assert.equal(r.ok, true);
  assert.deepEqual(await r.json(), { ok: true });

  // env guard with fallback
  assert.equal(getEnv('TEST_FALLBACK', 'x'), 'x');

  // fake clock
  await withFakeNow(1700000000000, async () => {
    assert.equal(Date.now(), 1700000000000);
  });

  await sleep(1);
});
