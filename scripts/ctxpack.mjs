#!/usr/bin/env node
// Minimal CLI: node scripts/ctxpack.mjs <validate|hash|print> <file>
import fs from 'node:fs/promises';
import { validateFile } from '../lib/ctxpack/validate.mjs';
import { sha256Canonical } from '../lib/ctxpack/hash.mjs';

const [, , cmd, file] = process.argv;

async function main() {
  if (!cmd || !file || !['validate','hash','print'].includes(cmd)) {
    console.error('Usage: node scripts/ctxpack.mjs <validate|hash|print> <file>');
    process.exit(2);
  }
  const raw = await fs.readFile(file, 'utf8');
  const obj = JSON.parse(raw);
  if (cmd === 'validate') {
    const res = await validateFile(file, { strictOrder: false });
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  } else if (cmd === 'hash') {
    const h = sha256Canonical(obj);
    console.log(h);
    process.exit(0);
  } else if (cmd === 'print') {
    console.log(JSON.stringify(obj, null, 2));
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
