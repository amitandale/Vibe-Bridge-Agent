// tests/planner.cli.exitcode.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('planner CLI: dry-run non-zero on empty essentials', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'planner-'));
  const diffPath = join(tmp, 'empty.diff');
  writeFileSync(diffPath, '', 'utf8');
  const out = spawnSync('node', ['scripts/planner.mjs','dry-run','--mode','PR','--diff', diffPath], { encoding:'utf8' });
  assert.equal(out.status, 3);
});

test('planner CLI: build enforces gate and outputs JSON', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'planner-'));
  const diffPath = join(tmp, 'touch.diff');
  writeFileSync(diffPath, 'diff --git a/lib/a.mjs b/lib/a.mjs\n+export const a = 1;\n', 'utf8');
  const out = spawnSync('node', ['scripts/planner.mjs','build','--mode','PR','--pr','42','--commit','deadbee','--diff', diffPath], { encoding:'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const obj = JSON.parse(out.stdout);
  assert.ok(obj.hash);
  assert.ok(Array.isArray(obj.must_include) && obj.must_include.length > 0);
});
