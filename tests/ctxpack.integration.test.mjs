import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const INPUT = path.join(repoRoot, 'assets', 'examples', 'ctxpack', 'contextpack.mvp.json');
const OUT = path.join(repoRoot, 'assets', 'examples', 'ctxpack', 'tmp.integration.out.json');
const REPORT = path.join(repoRoot, 'assets', 'examples', 'ctxpack', 'tmp.integration.report.json');

async function readJson(p){ const t = await fs.readFile(p, 'utf8'); return JSON.parse(t); }

test('integration: assembleAndPersist writes manifest and report (when reportPath provided)', { timeout: 20000 }, async () => {
  const mod = await import('../lib/ctxpack/integration.mjs');
  const raw = await fs.readFile(INPUT, 'utf8');
  const pack = JSON.parse(raw);
  try { await fs.rm(OUT, { force: true }); } catch {}
  try { await fs.rm(REPORT, { force: true }); } catch {}
  const manifest = await mod.assembleAndPersist(pack, { model: 'default', outPath: OUT, reportPath: REPORT, merge_max_tokens: 0 });
  assert.ok(manifest && typeof manifest === 'object');
  const written = await readJson(OUT);
  assert.ok(written && typeof written === 'object');
  const report = await readJson(REPORT);
  assert.equal(report.ok, true);
  // counters should exist and be numeric
  assert.equal(typeof report.ctxpack_tokens_total, 'number');
  assert.equal(typeof report.ctxpack_files_total, 'number');
  assert.equal(typeof report.ctxpack_evictions_total, 'number');
  assert.equal(typeof report.ctxpack_dedup_pointers_total, 'number');
})

test('integration: maybeAssembleWithFlag respects dry-run default', { timeout: 20000 }, async () => {
  const mod = await import('../lib/ctxpack/integration.mjs');
  const raw = await fs.readFile(INPUT, 'utf8');
  const pack = JSON.parse(raw);
  const res = await mod.maybeAssembleWithFlag(pack, { model: 'default', outPath: OUT });
  // default CTX_ASSEMBLE_DRYRUN=1 in helper should mark dry-run true
  assert.equal(typeof res.ok, 'boolean');
  assert.equal(res.dry, true);
})

test('integration: maybeAssembleWithFlag enforce when enabled', { timeout: 20000 }, async () => {
  const mod = await import('../lib/ctxpack/integration.mjs');
  const raw = await fs.readFile(INPUT, 'utf8');
  const pack = JSON.parse(raw);
  const envEnabled = process.env.CTX_ASSEMBLE_ENABLED;
  const envDry = process.env.CTX_ASSEMBLE_DRYRUN;
  try {
    process.env.CTX_ASSEMBLE_ENABLED = '1';
    process.env.CTX_ASSEMBLE_DRYRUN = '0';
    const res = await mod.maybeAssembleWithFlag(pack, { model: 'default', outPath: OUT });
    assert.equal(res.dry, false);
    assert.equal(typeof res.ok, 'boolean');
  } finally {
    if (envEnabled === undefined) delete process.env.CTX_ASSEMBLE_ENABLED; else process.env.CTX_ASSEMBLE_ENABLED = envEnabled;
    if (envDry === undefined) delete process.env.CTX_ASSEMBLE_DRYRUN; else process.env.CTX_ASSEMBLE_DRYRUN = envDry;
  }
})
