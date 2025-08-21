// test/smoke.test.mjs
import { assert, mock, resetMocks, fakeFetch, fixture, getEnv, withFakeNow, sleep } from './harness.mjs';

test('harness loads and basic helpers work', async () => {
  resetMocks();
  mock('https://api.example.test/hello', { body: JSON.stringify({ ok: true }) });
  const r = await fetch('https://api.example.test/hello');
  assert.equal(r.ok, true);
  const j = await r.json();
  assert.equal(j.ok, true);

  try { fixture('dummy.txt'); } catch {}

  const val = getEnv('TEST_ENV_FALLBACK', 'fallback');
  assert.equal(val, 'fallback');

  const before = Date.now();
  await withFakeNow(1700000000000, async () => {
    assert.equal(Date.now(), 1700000000000);
  });
  assert.equal(typeof before, 'number');

  await sleep(1);
});
