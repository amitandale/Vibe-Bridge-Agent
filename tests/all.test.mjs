// tests/all.test.mjs
// Aggregator that ensures all tests execute, with mocha-like globals shim.
import "./_globals.mjs";

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const rootDir = path.resolve(process.cwd(), "tests");
const re = /\.(test|spec)\.(mjs|js)$/;

const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p); continue; }
    const base = path.basename(p);
    if (base.startsWith("_")) continue;
    if (!re.test(base)) continue;
    files.push(p);
  }
}
walk(rootDir);
files.sort((a,b) => a.localeCompare(b));

for (const f of files) {
  if (path.resolve(f) === path.resolve(import.meta.filename)) continue;
  await import(url.pathToFileURL(f).href);
}
