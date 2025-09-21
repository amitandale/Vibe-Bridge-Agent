// tests/guard.no-unref-in-src.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';

async function* walk(dir){
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip app/ server routes and tests
      if (p.split(sep).includes('app')) continue;
      if (p.split(sep).includes('tests')) continue;
      yield* walk(p);
    } else if (entry.isFile() && (p.endsWith('.mjs') || p.endsWith('.js'))) {
      yield p;
    }
  }
}

test('no .unref() usage in source modules (awaited contexts cause cancellations)', async () => {
  const bad = [];
  for await (const p of walk(new URL('../lib', import.meta.url).pathname)) {
    const txt = await readFile(p, 'utf-8');
    if (txt.includes('.unref?.(') || txt.includes('.unref(')) {
      bad.push(p);
    }
  }
  assert.equal(bad.length, 0, 'Found disallowed .unref() usages in: ' + bad.join(', '));
});
