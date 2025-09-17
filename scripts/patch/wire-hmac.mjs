#!/usr/bin/env node
// Best-effort script to inject requireHmac() call at top of write route handlers.
// It searches for files under app/api and updates exported POST/PUT/DELETE functions.
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const API = path.join(ROOT, 'app', 'api');

function listFiles(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) out.push(...listFiles(p));
    else if (stat.isFile() && (p.endsWith('.ts') || p.endsWith('.js') || p.endsWith('.mjs'))) out.push(p);
  }
  return out;
}

function inject(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes("requireHmac")) return false;
  // naive detection for exported handlers
  const patterns = [/export\s+async\s+function\s+POST\s*\(/, /export\s+async\s+function\s+PUT\s*\(/, /export\s+async\s+function\s+DELETE\s*\(/];
  if (!patterns.some(p=>p.test(src))) return false;
  // add import at top
  src = "import { requireHmac } from '../../../../lib/security/guard.mjs';\n" + src;
  // inject call after function signature opening brace
  src = src.replace(/(export\s+async\s+function\s+(POST|PUT|DELETE)\s*\([^)]*\)\s*\{)/g, '$1\n  await requireHmac()(request);');
  fs.writeFileSync(file, src, 'utf8');
  return true;
}

const files = listFiles(API);
const changed = [];
for (const f of files) {
  try {
    if (inject(f)) changed.push(f);
  } catch (e) {
    console.error('fail', f, e.message);
  }
}
console.log('changed files:', changed.length);
for (const c of changed) console.log(' -', c);
