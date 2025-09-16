// tests/contracts/headers.contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sign, timingSafeEqualStr } from '../../lib/security/hmac.mjs';

test('x-signature format sha256=<hex> and timing safe compare', async () => {
  const secret = 's3cr3t';
  const body = Buffer.from('{"a":1}');
  const h = sign(secret, body);
  assert.ok(/^sha256=[a-f0-9]{64}$/.test(h), 'header format');
  const same = timingSafeEqualStr(h, h);
  assert.equal(same, true, 'timing safe equality works');
});
