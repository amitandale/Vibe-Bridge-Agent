import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

async function loadAdapter() {
  const m = await import('../../lib/specialists/retrieve.mjs');
  return m;
}

function makeSandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'spec-retrieve-'));
  // many files to enforce sorting
  for (let i=0;i<10;i++) {
    writeFileSync(join(dir, `file-${String(i).padStart(2,'0')}.mjs`), 'x'.repeat(1000+i));
  }
  writeFileSync(join(dir, 'Z-extra.md'), '# Z');
  return dir;
}

test('enforces cap and deterministic order', async () => {
  process.env.CONTEXT_PROVIDER = 'fs';
  const { retrieve } = await loadAdapter();
  const dir = makeSandbox();
  try {
    // cap to a small token budget
    const r1 = await retrieve({ repoRoot: dir }, 'file', { maxTokens: 5 }); // ≈ 20 chars
    const r2 = await retrieve({ repoRoot: dir }, 'file', { maxTokens: 5 });
    assert.deepEqual(r1.artifacts.map(a=>a.path), r2.artifacts.map(a=>a.path), 'order must be deterministic');
    const total1 = r1.artifacts.reduce((n,a)=>n + a.content.length, 0);
    const total2 = r2.artifacts.reduce((n,a)=>n + a.content.length, 0);
    assert.equal(total1, total2, 'total chars must be equal');
    assert.ok(total1 <= 20, 'cap must be enforced');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no network when disabled (mock Cody env ignored)', async () => {
  process.env.CONTEXT_PROVIDER = 'fs';
  process.env.CONTEXT_CODE_PROVIDER = 'cody';
  process.env.CODY_ENDPOINT = 'http://should-not-be-called.invalid';
  let fetchCalled = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => { fetchCalled++; throw new Error('network disabled'); };

  const { retrieve } = await loadAdapter();
  const dir = makeSandbox();
  try {
    const r = await retrieve({ repoRoot: dir }, 'file', { maxTokens: 5 });
    assert.ok(Array.isArray(r.artifacts));
    assert.equal(fetchCalled, 0, 'adapter must not trigger network');
  } finally {
    globalThis.fetch = origFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('same repo state → same results', async () => {
  process.env.CONTEXT_PROVIDER = 'fs';
  const { retrieve } = await loadAdapter();
  const dir = makeSandbox();
  try {
    const r1 = await retrieve({ repoRoot: dir }, '');
    const r2 = await retrieve({ repoRoot: dir }, '');
    assert.deepEqual(r1, r2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
