// tests/ba03.secrets.mapper.db.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../lib/db/migrate.mjs';
import { open } from '../lib/db/client.mjs';
import { setHmacKey, setActiveHmacKid, getByKid, listActiveForProject, getActiveHmac } from '../lib/repo/secrets.mjs';

test('BA-03: secrets mapper persists to SQLite secret table', async () => {
  migrate({}); // ensure schema
  await setHmacKey({ projectId:'p1', kid:'k1', key:'s1' });
  await setActiveHmacKid({ projectId:'p1', kid:'k1' });

  // Query the DB directly to confirm persistence
  const db = open();
  const json = db.all(".mode json\nSELECT kid, project_id, value, active FROM secret WHERE project_id='p1';");
  const rows = JSON.parse(json || "[]");
  const row = rows.find(r => r.kid === 'k1');
  assert.ok(row, 'secret row not found');
  assert.equal(row.value, 's1');
  assert.equal(Number(row.active), 1);

  // Mapper reads
  const byKid = getByKid('k1');
  assert.equal(byKid.projectId, 'p1');
  assert.equal(byKid.value, 's1');

  const activeList = listActiveForProject('p1');
  assert.ok(Array.isArray(activeList) && activeList.length === 1);
  assert.equal(activeList[0].kid, 'k1');

  const active = await getActiveHmac('p1');
  assert.equal(active.kid, 'k1');
  assert.equal(active.key, 's1');
});
