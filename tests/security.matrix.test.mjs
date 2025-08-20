
import test from 'node:test';
import assert from 'node:assert/strict';

const PROFILE = process.env.PROFILE || 'serverless';

test(`run-agent requires signature and ticket (${PROFILE})`, async () => {
  const body = JSON.stringify({ mode:'fixed-diff', owner:'o', repo:'r', base:'main', title:'t', diff:'--- a\n+++ b\n' });
  // Missing signature
  let res = await fetch('http://localhost/api/run-agent', { method:'POST', body });
  // In our test shim, just assert non-OK (401/403)
  assert.ok(!res.ok);
});
