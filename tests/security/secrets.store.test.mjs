// tests/security/secrets.store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { setHmacKey, setActiveHmacKid, getActiveHmac, getByKid, listActiveForProject } from '../../lib/repo/secrets.mjs';
import { rm } from 'node:fs/promises';

test('hmac store basic ops with main API', async () => {
  // Use default DATA_PATH used by repo/secrets.mjs in main: ./data/secrets.json
  try { await rm('./data/secrets.json'); } catch {}

  await setHmacKey({ projectId: 'p1', kid: 'k1', key: 's1' });
  await setActiveHmacKid({ projectId: 'p1', kid: 'k1' });

  const active = await getActiveHmac('p1');
  assert.equal(active.kid, 'k1');
  assert.equal(active.key, 's1');

  const byKid = await getByKid('k1');
  assert.equal(byKid.projectId, 'p1');
  assert.equal(byKid.value, 's1');

  const list = listActiveForProject('p1');
  assert.ok(Array.isArray(list) && list.length === 1);
  assert.equal(list[0].kid, 'k1');
});
