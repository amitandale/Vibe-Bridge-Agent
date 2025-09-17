#!/usr/bin/env node
// Revert using .hmac-backup content
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const BACKUP = path.join(ROOT, '.hmac-backup');
if (!fs.existsSync(BACKUP)) {
  console.error('no backup found');
  process.exit(1);
}
for (const f of fs.readdirSync(BACKUP)) {
  const orig = f.replace(/__/g, path.sep);
  fs.writeFileSync(path.join(ROOT, orig), fs.readFileSync(path.join(BACKUP, f)));
  console.log('reverted', orig);
}
