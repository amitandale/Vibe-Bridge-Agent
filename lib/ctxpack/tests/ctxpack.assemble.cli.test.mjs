import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';

const run = promisify(execFile);

test('ctxpack CLI: assemble --dry-run emits summary', async () => {
  const { stdout, stderr } = await run('node', ['scripts/ctxpack.mjs', 'assemble', 'assets/examples/ctxpack/contextpack.mvp.json', '--model', 'gpt-xyz', '--dry-run'], { timeout: 15000 });
  assert.equal(stderr.trim(), '');
  const summary = JSON.parse(stdout);
  assert.ok(summary.totals);
  assert.ok(summary.perSection);
});

test('ctxpack CLI: assemble --out writes manifest.json', async () => {
  const out = 'assets/examples/ctxpack/manifest.out.json';
  try { await fs.unlink(out); } catch {}
  const { stdout, stderr } = await run('node', ['scripts/ctxpack.mjs', 'assemble', 'assets/examples/ctxpack/contextpack.mvp.json', '--out', out], { timeout: 15000 });
  assert.equal(stderr.trim(), '');
  const path = stdout.trim();
  assert.equal(path, out);
  const raw = await fs.readFile(out, 'utf8');
  const obj = JSON.parse(raw);
  assert.ok(Array.isArray(obj.sections));
});
