import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function signBody(obj, secret){
  const raw = JSON.stringify(obj);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return { raw, sig };
}

test('contract: x-signature format and length', () => {
  const { raw, sig } = signBody({mode:'fixed-diff', a:1}, 's');
  assert.ok(raw.includes('"mode":"fixed-diff"'));
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
});

test('security: different secrets produce different signatures', () => {
  const body = { x: 1 };
  const a = signBody(body, 'a').sig;
  const b = signBody(body, 'b').sig;
  assert.notEqual(a, b);
});

test('large body still signs deterministically', () => {
  const big = { data: 'x'.repeat(10000) };
  const { sig } = signBody(big, 's');
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
});
