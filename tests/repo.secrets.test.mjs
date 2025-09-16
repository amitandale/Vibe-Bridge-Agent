// tests/repo.secrets.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { setHmacKey, setActiveHmacKid, getActiveHmac, getByKid, upsertEnv, getEnvForLane, isMirrorable, listMirrorableNames } from '../lib/repo/secrets.mjs';

test('HMAC CRUD and active kid', async () => {
  await setHmacKey({ projectId: 'p1', kid: 'k-1', key: 'abc123' });
  await setHmacKey({ projectId: 'p1', kid: 'k-2', key: 'def456' });
  await setActiveHmacKid({ projectId: 'p1', kid: 'k-2' });
  const act = await getActiveHmac('p1');
  assert.equal(act.kid, 'k-2');
  assert.equal(act.key, 'def456');

  const row = await getByKid('k-1');
  assert.equal(row.projectId, 'p1');
  assert.equal(row.key, 'abc123');
});

test('Env CRUD and mirrorability rules', async () => {
  await upsertEnv({ projectId: 'p2', name: 'APP_URL', value: 'http://x', scope: 'global' });
  await upsertEnv({ projectId: 'p2', name: 'OPENAI_API_KEY', value: 'sk-xxx', scope: 'lane', lane: 'ci' });
  await upsertEnv({ projectId: 'p2', name: 'HMAC_SECRET', value: 's', scope: 'lane', lane: 'ci' });

  const env = await getEnvForLane('p2', 'ci');
  assert.equal(env.APP_URL, 'http://x');
  assert.equal(env.HMAC_SECRET, 's');
  assert.equal(env.OPENAI_API_KEY, 'sk-xxx');

  assert.equal(isMirrorable('OPENAI_API_KEY'), false);
  const names = await listMirrorableNames('p2', 'ci');
  assert.deepEqual(names.sort(), ['APP_URL','HMAC_SECRET'].sort());
});
