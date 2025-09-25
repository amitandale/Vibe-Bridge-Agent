import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('planner CLI dry-run exits non-zero when essentials missing', async (t) => {
  const tmp = join(tmpdir(), 'empty.diff');
  await writeFile(tmp, '');
  const p = spawn(process.execPath, ['scripts/planner.mjs', 'dry-run', '--pr', '1', '--commit', 'deadbee', '--mode', 'PR', '--diff', tmp], { stdio: 'ignore' });
  const code = await new Promise(res => p.on('close', res));
  assert.notEqual(code, 0);
});

test('planner CLI: build enforces gate and outputs JSON', () => {
  // minimal diff touching one file to produce a must_include
  const diffPath = 'tmp2.diff';
  writeFileSync(diffPath, 'diff --git a/lib/a.mjs b/lib/a.mjs\n+export const a = 1;\n', 'utf8');
  const out = spawnSync('node', ['scripts/planner.mjs','build','--mode','PR','--pr','42','--commit','deadbee','--diff', diffPath], { encoding:'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const obj = JSON.parse(out.stdout);
  assert.ok(obj.hash);
  assert.ok(Array.isArray(obj.must_include));
  assert.ok(obj.must_include.length > 0);
});
