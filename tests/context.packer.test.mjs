import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

async function loadPacker() {
  const m = await import('../lib/context/pack.mjs');
  return m;
}

function makeSandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-pack-'));
  writeFileSync(join(dir, 'a.mjs'), 'export const A = 1; // secret:XYZ');
  writeFileSync(join(dir, 'b.js'),  'console.log("hello");');
  writeFileSync(join(dir, 'c.md'),  '# Title\nHello world');
  writeFileSync(join(dir, 'd.json'),'{"k":"v"}');
  return dir;
}

test('fs provider: deterministic order and budget respected', async (t) => {
  process.env.CONTEXT_PROVIDER = 'fs';
  const { pack } = await loadPacker();
  const dir = makeSandbox();
  try {
    const budget = { maxChars: 40_000, maxFiles: 3 };
    const r1 = await pack({ repoRoot: dir, query:'', budget });
    const r2 = await pack({ repoRoot: dir, query:'', budget });
    assert.equal(r1.artifacts.length, 3);
    assert.equal(r2.artifacts.length, 3);
    assert.deepEqual(r1.artifacts.map(a=>a.path), r2.artifacts.map(a=>a.path));
    assert.equal(r1.budget.maxFiles, 3);
    assert.equal(r1.budget.usedFiles, 3);
    assert.ok(r1.budget.usedChars > 0);
    assert.equal(r1.budget.maxChars, 40_000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fs provider: redaction hook applied before slicing', async (t) => {
  process.env.CONTEXT_PROVIDER = 'fs';
  const { pack } = await loadPacker();
  const dir = makeSandbox();
  try {
    const redact = async (txt) => txt.replaceAll('secret:', 'REDACTED:');
    const r = await pack({ repoRoot: dir, budget:{ maxChars: 2000, maxFiles: 4 }, redact });
    const joined = r.artifacts.map(a=>a.content).join('\n');
    assert.ok(joined.includes('REDACTED:XYZ'));
    assert.ok(!joined.includes('secret:XYZ'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fs provider: maxChars budget clamps content', async (t) => {
  process.env.CONTEXT_PROVIDER = 'fs';
  const { pack } = await loadPacker();
  const dir = makeSandbox();
  try {
    const r = await pack({ repoRoot: dir, budget:{ maxChars: 10, maxFiles: 10 } });
    const total = r.artifacts.reduce((n,a)=>n + a.content.length, 0);
    assert.equal(total, 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('llamaindex provider: skipped if llamaindex not installed', async (t) => {
  process.env.CONTEXT_PROVIDER = 'llamaindex';
  const { pack } = await loadPacker();
  const dir = makeSandbox();
  try {
    let skipped = false;
    try {
      await pack({ repoRoot: dir, query:'hello', budget:{ maxChars: 1000, maxFiles: 10 } });
    } catch (e) {
      if (String(e.message || e).includes('LlamaIndex not installed')) {
        skipped = true;
      } else {
        throw e;
      }
    }
    assert.equal(skipped, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
