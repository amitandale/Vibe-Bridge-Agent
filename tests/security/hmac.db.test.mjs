import tap from 'tap';
import { clear, upsert, listByProject, getByKid } from '../../bridge-agent/lib/repo/secrets.mjs';
import { applyAll } from '../../bridge-agent/lib/db/migrate.mjs';

tap.test('migrations and db secrets', async t=>{
  applyAll();
  await clear();
  const pid = 'pdb1';
  await upsert({ kid: 'kdb1', project_id: pid, type: 'HMAC', value: 'v1', active: 1, created_at: Math.floor(Date.now()/1000) });
  await upsert({ kid: 'kdb2', project_id: pid, type: 'HMAC', value: 'v2', active: 1, created_at: Math.floor(Date.now()/1000) });
  // adding third should deactivate oldest
  await upsert({ kid: 'kdb3', project_id: pid, type: 'HMAC', value: 'v3', active: 1, created_at: Math.floor(Date.now()/1000) });
  const keys = await listByProject(pid);
  t.equal(keys.length, 3);
  // ensure only two actives
  const actives = keys.filter(k=>k.active===1);
  t.equal(actives.length, 2);
  t.end();
});
