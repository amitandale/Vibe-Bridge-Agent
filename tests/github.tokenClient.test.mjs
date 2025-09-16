// tests/github.tokenClient.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenClient } from '../lib/github.mjs';

test('tokenClient requires token', () => {
  let threw=false;
  try { tokenClient(); } catch { threw=true; }
  assert.equal(threw, true);
});
