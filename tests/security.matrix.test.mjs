
import test from 'node:test';
import assert from 'node:assert/strict';
import { requireBridgeGuards, setDisabled } from '../lib/security/guard.mjs';

const PROFILE = process.env.PROFILE || 'serverless';

function req(h={}){
  return new Request('http://br/api/run-agent', { method:'POST', headers: h, body: '{}' });
}

test(`run-agent requires signature and ticket (${PROFILE})`, async () => {
  let r = requireBridgeGuards(req({ 'x-vibe-ticket':'t' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'MISSING_SIGNATURE');

  r = requireBridgeGuards(req({ 'x-signature':'sha256=abc' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'MISSING_TICKET');

  setDisabled(true);
  r = requireBridgeGuards(req({ 'x-signature':'sha256=abc', 'x-vibe-ticket':'t' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DISABLED');

  setDisabled(false);
  r = requireBridgeGuards(req({ 'x-signature':'sha256=abc', 'x-vibe-ticket':'t' }));
  assert.equal(r.ok, true);
});
