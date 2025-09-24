// tests/all.test.mjs
// Deterministic aggregator. Runs each *.test.mjs as its own subtest.
// Benefits:
// - ESM import/parse errors are attributed to the specific file subtest.
// - Any late async failure from that file is labeled with the file path.
// Node will execute ONLY this file (see package.json "test" script).

import test from "node:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));

async function *walk(dir) {
  const ents = await readdir(dir, { withFileTypes: true });
  for (const ent of ents) {
    if (ent.name.startsWith("harness")) continue;     // skip harness
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield *walk(p);
    } else {
      yield p;
    }
  }
}

function rel(p) {
  return p.replace(TEST_ROOT + path.sep, "").split(path.sep).join("/");
}

const files = [];
for await (const p of walk(TEST_ROOT)) {
  if (p.endsWith(".test.mjs") && !p.endsWith("all.test.mjs")) files.push(p);
}
files.sort();

for (const p of files) {
  const name = rel(p);
  await test(name, async (t) => {
    const url = pathToFileURL(p);
    try {
      await import(url.href);
    } catch (e) {
      e.message += ` [while importing ${name}]`;
      throw e;
    }
  });
}
