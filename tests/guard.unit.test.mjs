
import test from 'node:test';
import assert from 'node:assert/strict';
import { requireBridgeGuards, setDisabled } from '../lib/security/guard.mjs';

function fakeReq(h={}){
  return new Request('http://br/api/run-agent', { method:'POST', headers: h, body: '{}' });
}

test('missing signature rejected', () => {
  const r = requireBridgeGuards(fakeReq({ 'x-vibe-ticket': 't' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'MISSING_SIGNATURE');
});

test('missing ticket rejected', () => {
  const r = requireBridgeGuards(fakeReq({ 'x-signature': 'sha256=abc' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'MISSING_TICKET');
});

test('heartbeat disable blocks actions', () => {
  setDisabled(true);
  const r = requireBridgeGuards(fakeReq({ 'x-signature': 'sha256=abc', 'x-vibe-ticket': 't' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DISABLED');
  setDisabled(false);
});

test('both present passes when not disabled', () => {
  const r = requireBridgeGuards(fakeReq({ 'x-signature': 'sha256=abc', 'x-vibe-ticket': 't' }));
  assert.equal(r.ok, true);
});
