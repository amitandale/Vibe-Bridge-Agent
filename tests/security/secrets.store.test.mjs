// tests/security/secrets.store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { listByProject, getByKid, upsert, rotate, setActive } from '../../lib/repo/secrets.mjs';
import { rm } from 'node:fs/promises';

test('secrets store upsert and list', async () => {
  process.env.BA_LOCAL_STORE_PATH = './data/test.local.json';
  try { await rm(process.env.BA_LOCAL_STORE_PATH); } catch {}
  await upsert({ project_id: 'p1', kid: 'k1', value: 's1' });
  let list = await listByProject('p1');
  assert.equal(list.length >= 1, true);
  const k1 = list.find(x=>x.kid==='k1');
  assert.equal(!!k1, true);
  assert.equal(k1.value, 's1');

  await rotate({ project_id: 'p1', newKid:'k2', newKey:'s2', now: Date.now() });
  list = await listByProject('p1');
  const cur = list.find(x=>x.kid==='k2');
  const prev = list.find(x=>x.kid==='k1');
  assert.equal(cur.active, true);
  assert.equal(prev.active, true);

  const g = await getByKid('k1');
  assert.equal(g.project_id, 'p1');

  await setActive({ project_id:'p1', kid:'k1' });
  list = await listByProject('p1');
  assert.equal(list.find(x=>x.kid==='k1').active, true);
});
