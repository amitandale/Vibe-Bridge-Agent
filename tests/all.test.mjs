// tests/all.test.mjs
// Aggregator that makes each file a subtest to pinpoint syntax errors.
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const rootDir = path.resolve(process.cwd(), 'tests');
const re = /\.(test|spec)\.(mjs|js)$/;

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(p);
      continue;
    }
    const base = path.basename(p);
    if (base.startsWith('_')) continue;
    if (!re.test(base)) continue;
    yield p;
  }
}

const selfPath = path.resolve(url.fileURLToPath(import.meta.url));
const files = Array.from(walk(rootDir)).filter(f => path.resolve(f) !== selfPath).sort();

for (const f of files) {
  test('load ' + path.relative(rootDir, f), async () => {
    await import(url.pathToFileURL(f).href);
  });
}
