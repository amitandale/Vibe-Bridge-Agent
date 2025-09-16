// tests/security/hmac.lib.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { _clearStore, _seed, _rotate, sign, verifySignature, timingSafeEqualStr, lookupKey } from '../../lib/security/hmac.mjs';

test('sign + verify ok', () => {
  _clearStore();
  _seed({ projectId: 'p1', kid: 'k1', key: 's1' });
  const raw = Buffer.from('{"a":1}');
  const sig = sign(raw, 's1');
  const v = verifySignature({ projectId: 'p1', kid: 'k1', signature: sig, raw });
  assert.equal(v.ok, true);
  assert.equal(v.used, 'current');
});

test('verify rejects wrong algo prefix', () => {
  _clearStore();
  _seed({ projectId: 'p', kid: 'k', key: 's' });
  const v = verifySignature({ projectId: 'p', kid: 'k', signature: 'sha1=xyz', raw: '' });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'ERR_HMAC_MISMATCH');
});

test('missing project or kid yields missing', () => {
  _clearStore();
  _seed({ projectId: 'p', kid: 'k', key: 's' });
  const v = verifySignature({ projectId: '', kid: '', signature: 'sha256=00', raw: '' });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'ERR_HMAC_MISSING');
});

test('rotation grace accepts previous key within window', () => {
  _clearStore();
  const now = Date.now();
  _seed({ projectId: 'p', kid: 'k1', key: 's1', now });
  _rotate({ projectId: 'p', newKid: 'k2', newKey: 's2', now: now + 1000 });
  const sigPrev = sign(Buffer.from('x'), 's1');
  const okPrev = verifySignature({ projectId: 'p', kid: 'k1', signature: sigPrev, raw: Buffer.from('x') }, { now: now + 2000, grace_s: 10 });
  assert.equal(okPrev.ok, true);
  assert.equal(okPrev.used, 'previous');
  const missPrev = verifySignature({ projectId: 'p', kid: 'k1', signature: sigPrev, raw: Buffer.from('x') }, { now: now + 20_000, grace_s: 10 });
  assert.equal(missPrev.ok, false);
  assert.equal(missPrev.code, 'ERR_HMAC_MISSING');
});

test('lookupKey returns null for unknown', () => {
  _clearStore();
  assert.equal(lookupKey('x','y') === null, true);
});

test('timingSafeEqualStr diff returns false', () => {
  assert.equal(timingSafeEqualStr('a','b'), false);
});
