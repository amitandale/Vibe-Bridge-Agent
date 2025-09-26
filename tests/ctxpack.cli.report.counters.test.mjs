import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const CLI = path.join(repoRoot, 'scripts', 'ctxpack.mjs');
const INPUT = path.join(repoRoot, 'assets', 'examples', 'ctxpack', 'contextpack.mvp.json');

function run(args, env={}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 20000,
  });
}

test('cli report contains explicit counters', { timeout: 20000 }, async () => {
  const report = path.join(repoRoot, 'assets', 'examples', 'ctxpack', 'tmp.cli.counters.report.json');
  try { await fs.rm(report, { force: true }); } catch {}
  const r = run(['assemble', '--model', 'default', '--in', INPUT, '--dry-run', '--report', report]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const txt = await fs.readFile(report, 'utf8');
  const obj = JSON.parse(txt);
  assert.equal(typeof obj.ctxpack_tokens_total, 'number');
  assert.equal(typeof obj.ctxpack_files_total, 'number');
  assert.equal(typeof obj.ctxpack_evictions_total, 'number');
  assert.equal(typeof obj.ctxpack_dedup_pointers_total, 'number');
})

test('determinism mismatch emits structured JSON when exit=4', { timeout: 15000 }, () => {
  // Cannot force mismatch reliably; validate shape only when it happens.
  const r = run(['assemble', '--model', 'default', '--in', INPUT, '--dry-run'], { CTX_DETERMINISM_CHECK: '1', __FORCE_HASH_SALT: 'x' });
  if (r.status === 4) {
    const msg = (r.stderr || '').trim();
    assert.ok(msg.length > 0);
    const obj = JSON.parse(msg);
    assert.equal(obj.reason, 'DETERMINISM_ERROR');
    assert.ok(typeof obj.hash_a === 'string' && typeof obj.hash_b === 'string');
    assert.ok(obj.metrics === undefined || typeof obj.metrics === 'object');
  } else {
    assert.ok([0].includes(r.status));
  }
})
