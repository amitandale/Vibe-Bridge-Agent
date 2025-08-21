// tests/_runner.mjs
// Load only .mjs tests under ./tests recursively (ignore legacy .js files)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(process.cwd(), 'tests');
const files = [];
function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.mjs')) continue;
    if (path.basename(p).startsWith('_')) continue;
    files.push(p);
  }
}
walk(root);
await Promise.all(files.map(f => import(url.pathToFileURL(f).href)));
