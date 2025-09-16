// tests/_runner.mjs
// Deterministic discovery for Node's built-in test runner.
// Loads only *.{test,spec}.{mjs,js} recursively under ./tests.
// Skips helper files starting with underscore.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

// Optional shared teardown if present
try { await import("./_teardown.mjs"); } catch {}

const root = path.resolve(process.cwd(), "tests");
const files = [];
const re = /\.(test|spec)\.(mjs|js)$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p); continue; }
    const b = path.basename(p);
    if (b.startsWith("_")) continue;
    if (!re.test(b)) continue;
    files.push(p);
  }
}
walk(root);
files.sort((a,b) => a.localeCompare(b));
await Promise.all(files.map(f => import(url.pathToFileURL(f).href)));
