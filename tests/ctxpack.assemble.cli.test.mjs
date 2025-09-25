import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { sha256Canonical } from '../lib/ctxpack/hash.mjs';

const run = promisify(execFile);

test('ctxpack CLI: assemble --dry-run emits summary', async () => {
  const { stdout, stderr } = await run('node', ['scripts/ctxpack.mjs', 'assemble', 'assets/examples/ctxpack/contextpack.mvp.json', '--model', 'gpt-xyz', '--dry-run'], { timeout: 15000 });
  assert.equal(stderr.trim(), '');
  const summary = JSON.parse(stdout);
  assert.ok(summary.totals);
  assert.ok(summary.perSection);
});

test('ctxpack CLI: assemble --out writes manifest.json', async () => {
  const out = 'assets/examples/ctxpack/manifest.cli.out.json';
  try { await fs.unlink(out); } catch {}
  const { stdout, stderr } = await run('node', ['scripts/ctxpack.mjs', 'assemble', 'assets/examples/ctxpack/contextpack.mvp.json', '--out', out], { timeout: 15000 });
  assert.equal(stderr.trim(), '');
  const path = stdout.trim();
  assert.equal(path, out);
  const raw = await fs.readFile(out, 'utf8');
  const obj = JSON.parse(raw);
  assert.ok(Array.isArray(obj.sections));
});

test('ctxpack CLI: assemble exits non-zero with BUDGET_ERROR on non-droppable overflow', async () => {
  // Create a minimal failing pack file
  const pack = {
    version: '1.0.0',
    project: { id: 'demo' },
    pr: { id: '1', branch: 'work', commit_sha: 'deadbeef' },
    mode: 'PR',
    order: ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'],
    budgets: { max_tokens: 1, max_files: 0, max_per_file_tokens: 1, section_caps:{templates:0,spec_canvas:0,diff_slices:0,linked_tests:0,contracts:0,extras:0} },
    sections: [
      { name:'templates', items: [ { id:'must.txt', content: 'CANNOT FIT' } ] },
      { name:'spec_canvas', items: [] },
      { name:'diff_slices', items: [] },
      { name:'linked_tests', items: [] },
      { name:'contracts', items: [] },
      { name:'extras', items: [] },
    ],
    must_include: ['must.txt'], nice_to_have: [], never_include: [], provenance: [], hash: '0'.repeat(64)
  };
  const c = structuredClone(pack); delete c.hash; pack.hash = sha256Canonical(c);
  const tmp = 'assets/examples/ctxpack/tmp.non_droppable.fail.json';
  await fs.writeFile(tmp, JSON.stringify(pack, null, 2), 'utf8');
  try {
    await run('node', ['scripts/ctxpack.mjs', 'assemble', tmp], { timeout: 15000 });
    assert.fail('expected non-zero exit');
  } catch (e) {
    // Node returns an error object with stdout/stderr
    assert.ok(String(e.stderr || e.stdout).includes('BUDGET_ERROR'), 'stderr should include BUDGET_ERROR');
  } finally {
    try { await fs.unlink(tmp); } catch {}
  }
});
