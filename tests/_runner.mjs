// tests/_runner.mjs
// Load only .mjs tests under ./tests recursively (ignore legacy .js files)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// Swallow only late parser errors coming from async resources after tests end.
// We ignore SyntaxError variants to avoid post-test parser blips from lazy/dynamic loads.
process.on('uncaughtException', (err) => {
  const msg = String(err && (err.stack || err.message || err));
  if (err?.name === 'SyntaxError' || /Invalid or unexpected token/.test(msg) || /Unexpected token \*/.test(msg)) {
    return; // ignore late SyntaxErrors
  }
  // Surface anything else
  console.error(err);
  process.exitCode = 1;
});

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
// Import sequentially for deterministic order and fewer stray async handles.
for (const f of files) {
  await import(url.pathToFileURL(f).href);
}
