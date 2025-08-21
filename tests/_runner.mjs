// tests/_runner.mjs
// Only import .mjs tests from ./tests recursively (exclude legacy .js files)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(process.cwd(), 'tests');
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.mjs')) continue;           // ignore legacy .js
    if (path.basename(p).startsWith('_')) continue; // ignore harness/runner helpers
    files.push(p);
  }
}
if (fs.existsSync(root)) walk(root);
// Import each .mjs test so Node's test runner picks up their `test()` calls
await Promise.all(files.map(f => import(url.pathToFileURL(f).href)));
