// tests/contracts/pack.contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(p){ return fs.readFileSync(p, 'utf8'); }

test('fs and llamaindex packers share the same default budget numbers', async () => {
  const fsPath = new URL('../../lib/context/pack.fs.mjs', import.meta.url);
  const liPath = new URL('../../lib/context/pack.llamaindex.mjs', import.meta.url);
  const A = read(fsPath);
  const B = read(liPath);
  const pattern = /function\s+defaultBudget\(b\)\s*{\s*const\s+maxChars\s*=\s*Math\.max\(1,\s*b\?\.maxChars\s*\?\?\s*200_000\);\s*const\s+maxFiles\s*=\s*Math\.max\(1,\s*b\?\.maxFiles\s*\?\?\s*50\)/m;
  assert.ok(pattern.test(A), 'fs packer defaultBudget matches expected');
  assert.ok(pattern.test(B), 'llamaindex packer defaultBudget matches expected');
});
