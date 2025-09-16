// tests/secrets.mirror.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mirrorRepoSecrets } from '../scripts/ci/secrets/sync.mjs';
import * as Projects from '../lib/repo/projects.mjs';
import * as Secrets from '../lib/repo/secrets.mjs';

test('mirror to repo secrets uses installation token and encrypts values', async () => {
  // Bind project to repo
  if (Projects.upsert) Projects.upsert({ id: 'p3', name: 'p3', repo_owner: 'octo', repo_name: 'hello' });
  else if (Projects.set) Projects.set({ id: 'p3', name: 'p3', repo_owner: 'octo', repo_name: 'hello' });

  // Store env
  await Secrets.upsertEnv({ projectId: 'p3', name: 'APP_URL', value: 'http://x', scope: 'global' });
  await Secrets.upsertEnv({ projectId: 'p3', name: 'HMAC_SECRET', value: 'shhh', scope: 'lane', lane: 'ci' });

  // Fake fetch pipeline that records calls
  const calls = [];
  const http = async (url, init={}) => {
    calls.push({ url, init });
    if (String(url).endsWith('/actions/secrets/public-key')) {
      return { json: async () => ({ key_id: 'kid123', key: 'b64pub=='}), status: 200 };
    }
    return { status: 201, json: async () => ({}) };
  };

  // Deterministic encryptFn for test
  const encryptFn = (pub, val) => `enc(${pub}:${val})`;
  const getInstallationToken = async () => ({ token: 't-123' });

  const r = await mirrorRepoSecrets({ projectId: 'p3', lane: 'ci', http, encryptFn, getInstallationToken });
  assert.equal(r.owner, 'octo'); assert.equal(r.repo, 'hello');
  // Two PUTs: APP_URL and HMAC_SECRET
  const puts = calls.filter(c => c.init?.method === 'PUT');
  assert.equal(puts.length, 2);
  assert.ok(puts[0].url.includes('/actions/secrets/'));
  const body = JSON.parse(puts[0].init.body);
  assert.equal(body.key_id, 'kid123');
  assert.match(body.encrypted_value, /^enc\(b64pub==:/);
});
