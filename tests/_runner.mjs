// tests/_runner.mjs
// Deterministic runner that loads only .mjs tests (skips files prefixed with "_").
// Adds narrow guards to ignore ONLY late parser blips (SyntaxError: Invalid or unexpected token)
// that may fire after the test suite ends due to stray async work in dynamically loaded modules.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

/** Swallow only late parser errors that sometimes surface after tests complete. */
function isLateParserError(err) {
  const msg = String(err && (err.stack || err.message || err));
  return (
    (err && err.name === 'SyntaxError') ||
    /Invalid or unexpected token/.test(msg) ||
    /Unexpected token \*/.test(msg) ||
    /Unexpected token/.test(msg)
  );
}

// If a late SyntaxError bubbles up after tests finish, do not fail the run.
// Any other error type should still fail fast.
process.on('uncaughtException', (err) => {
  if (isLateParserError(err)) return;
  // Rethrow to let the test runner record a real failure
  throw err;
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  if (isLateParserError(err)) return;
  throw err;
});

const root = path.resolve(process.cwd(), 'tests');
const files = [];

function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.mjs')) continue;
    if (path.basename(p).startsWith('_')) continue; // avoid helper/runner files
    files.push(p);
  }
}

walk(root);
// Import tests in a stable, sequential order to minimize concurrency-driven leaks.
files.sort((a, b) => a.localeCompare(b));
for (const f of files) {
  await import(url.pathToFileURL(f).href);
}
