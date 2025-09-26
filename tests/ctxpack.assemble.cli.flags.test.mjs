import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const CLI = path.join(repoRoot, 'scripts', 'ctxpack.mjs');

// Reuse canonical example path used by the existing suite
const INPUT = path.join(repoRoot, 'assets', 'examples', 'ctxpack', 'contextpack.mvp.json');

function run(args, env = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 20000,
  });
  return res;
}

test('report flag writes JSON with hash and metrics shape', async () => {
  const report = path.join(repoRoot, 'assets', 'examples', 'ctxpack', 'tmp.cli.report.json');
  try { await fs.rm(report, { force: true }); } catch {}
  const r = run(['assemble', '--model', 'default', '--in', INPUT, '--dry-run', '--report', report]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const txt = await fs.readFile(report, 'utf8');
  const obj = JSON.parse(txt);
  assert.equal(obj.ok, true);
  assert.ok(typeof obj.hash === 'string' && obj.hash.length >= 40);
  assert.ok(obj.metrics === null || typeof obj.metrics === 'object');
});

test('out flag writes manifest only when not dry-run', async () => {
  const out = path.join(repoRoot, 'assets', 'examples', 'ctxpack', 'tmp.cli.pack.json');
  try { await fs.rm(out, { force: true }); } catch {}
  const r = run(['assemble', '--model', 'default', '--in', INPUT, '--out', out, '--dry-run']);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  let exists = false;
  try { await fs.access(out); exists = true; } catch {}
  assert.equal(exists, false);

  const r2 = run(['assemble', '--model', 'default', '--in', INPUT, '--out', out]);
  assert.equal(r2.status, 0, r2.stderr || r2.stdout);
  const txt = await fs.readFile(out, 'utf8');
  const obj = JSON.parse(txt);
  assert.ok(obj && (obj.hash || obj.metrics));
});

test('determinism guard status is 0 or 4 when enabled', () => {
  const r = run(['assemble', '--model', 'default', '--in', INPUT, '--dry-run'], { CTX_DETERMINISM_CHECK: '1' });
  assert.ok([0, 4].includes(r.status), `unexpected status ${r.status}\n${r.stderr || ''}`);
});

test('section.cap accepts multiple entries', () => {
  const r = run(['assemble', '--model', 'default', '--in', INPUT, '--dry-run',
                 '--section.cap', 'templates=100,5', '--section.cap', 'extras=50,2']);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
