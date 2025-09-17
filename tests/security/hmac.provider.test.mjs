// tests/security/hmac.provider.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { setSecretsProvider, verifySignature, sign, _clearStore, _seed } from '../../lib/security/hmac.mjs';
import * as Secrets from '../../lib/repo/secrets.mjs';
import { rm } from 'node:fs/promises';

test('verifySignature works with repo secrets provider (main API)', async () => {
  try { await rm('./data/secrets.json'); } catch {}
  _clearStore();
  await Secrets.setHmacKey({ projectId:'pA', kid:'ka', key:'sa' });
  await Secrets.setActiveHmacKid({ projectId:'pA', kid:'ka' });
  setSecretsProvider(Secrets);
  const raw = Buffer.from('{"z":1}');
  const sig = sign(raw, 'sa');
  const v = await verifySignature({ projectId:'pA', kid:'ka', signature:sig, raw });
  assert.equal(v.ok, true);
});
