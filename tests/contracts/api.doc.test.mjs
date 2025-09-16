// tests/contracts/api.doc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('api.md documents headers, budgets, and llamaindex', async () => {
  const s = fs.readFileSync(new URL('../../docs/api.md', import.meta.url), 'utf8');
  assert.ok(s.includes('x-signature'), 'x-signature documented');
  assert.ok(s.includes('x-vibe-ticket'), 'x-vibe-ticket documented');
  assert.ok(/200\s*000/.test(s), 'budget maxChars 200000 documented');
  assert.ok(/\b50\b/.test(s), 'budget maxFiles 50 documented');
  assert.ok(s.toLowerCase().includes('llamaindex'), 'llamaindex documented');
  assert.ok(s.includes('CONTEXT_PROVIDER=llamaindex'), 'env switch documented');
});
