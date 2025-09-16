// tools/c8-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const TEMP = path.resolve(process.cwd(), 'coverage/tmp');

// 1) Ensure temp dir exists
fs.mkdirSync(TEMP, { recursive: true });

// 2) Prune any non-JSON files and invalid JSON blobs to avoid c8 null.result crash
for (const ent of fs.readdirSync(TEMP, { withFileTypes: true })) {
  if (!ent.isFile()) continue;
  const p = path.join(TEMP, ent.name);
  let shouldDelete = false;
  if (!ent.name.endsWith('.json')) {
    shouldDelete = true;
  } else {
    try {
      const txt = fs.readFileSync(p, 'utf8').trim();
      const obj = JSON.parse(txt);
      if (!obj || typeof obj !== 'object' || !('result' in obj)) shouldDelete = true;
    } catch {
      shouldDelete = true;
    }
  }
  if (shouldDelete) {
    try { fs.unlinkSync(p); } catch {}
  }
}

// 3) If no JSON left, exit 0 quickly
const left = fs.readdirSync(TEMP).filter(n => n.endsWith('.json'));
if (left.length === 0) {
  console.log('[c8] no V8 coverage JSON found in coverage/tmp; skipping report');
  process.exit(0);
}

// 4) Run c8 report forcing temp-directory to our path to avoid config misses
const args = ['report', '--reporter', 'text', '--temp-directory', TEMP];
const c8 = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(c8, ['c8', ...args], { stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 1));
