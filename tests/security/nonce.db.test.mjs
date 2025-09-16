import { dbAvailable } from '../../lib/db/client.mjs';
// tests/security/nonce.db.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../../lib/db/migrate.mjs';
import { NonceCache } from '../../lib/security/nonceCache.mjs';

test('NonceCache uses DB when available', async () => {
  migrate({});
  const cache1 = new NonceCache({ ttlDefaultS: 10 });
  const a = await cache1.insertIfAbsent('replay-1', { purpose:'ticket', ttlS: 10 });
  assert.equal(a, true);
  // New instance still detects replay because DB persisted it
  const cache2 = new NonceCache({ ttlDefaultS: 10 });
  const b = await cache2.insertIfAbsent('replay-1', { purpose:'ticket', ttlS: 10 });
  assert.equal(b, false);
});