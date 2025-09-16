import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { runReindex } from '../../scripts/context/reindex.mjs';

test('reindex dry-run completes and reports metrics', async () => {
  // Create a temp tree with a couple files
  const tmp = fs.mkdtempSync(path.join(process.cwd(), 'tmp-reindex-'));
  const a = path.join(tmp, 'src'); fs.mkdirSync(a);
  fs.writeFileSync(path.join(a, 'a.mjs'), 'export const a=1');
  fs.writeFileSync(path.join(a, 'b.md'), '# doc');

  const res = await runReindex({ cwd: tmp, dryRun: true, paths: ['src'], concurrency: 2 });
  assert.equal(res.ok, true);
  assert.equal(res.total, 2);
  assert.equal(res.indexed, 2);
});
