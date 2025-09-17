#!/usr/bin/env node
// Advanced wiring script.
// - Creates .hmac-backup directory for originals
// - Injects import + requireHmac() call into exported POST/PUT/DELETE handlers
// - Adds marker comment // HMAC-INJECTED to prevent double patching
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const API = path.join(ROOT, 'app', 'api');
const BACKUP = path.join(ROOT, '.hmac-backup');

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) out.push(...listFiles(p));
    else if (stat.isFile() && (p.endsWith('.ts') || p.endsWith('.js') || p.endsWith('.mjs'))) out.push(p);
  }
  return out;
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP)) fs.mkdirSync(BACKUP, { recursive: true });
}

function backup(file) {
  ensureBackupDir();
  const rel = path.relative(process.cwd(), file);
  const dest = path.join(BACKUP, rel.replace(/[\\/]/g, '__'));
  fs.writeFileSync(dest, fs.readFileSync(file));
}

function inject(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('// HMAC-INJECTED')) return false;
  const hasHandler = /export\s+async\s+function\s+(POST|PUT|DELETE)\s*\(/.test(src);
  if (!hasHandler) return false;
  // determine relative import path to guard
  const depth = file.split(path.sep).length - path.join(ROOT,'app','api').split(path.sep).length;
  const rel = Array(depth+1).fill('..').join('/') + '/../../../lib/security/guard.mjs';
  const importLine = "import { requireHmac } from '" + rel + "';\n";
  // avoid duplicating import if another requireHmac import exists
  if (!/requireHmac\b/.test(src)) {
    src = importLine + src;
  }
  // inject call into handler bodies
  src = src.replace(/(export\s+async\s+function\s+(POST|PUT|DELETE)\s*\([^)]*\)\s*\{)/g, '$1\n  // HMAC-INJECTED\n  await requireHmac()(request);');
  backup(file);
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
console.log('patched', changed.length, 'files');
for (const c of changed) console.log(' -', c);
