// tests/ba03.db.boot.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, dbFile } from '../lib/db/client.mjs';
import { spawnSync } from 'node:child_process';

test('BA-03: migrate runs on client import (boot-time hook)', () => {
  const dir = dataDir();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(dir, { recursive: true });
  const fileBefore = path.resolve(dbFile());
  try { fs.rmSync(fileBefore, { force: true }); } catch {}

  // Spawn a clean Node ESM process that imports the client; this should trigger migrate-on-boot.
  const code = [
    "import '../lib/db/client.mjs';",
    "import { open } from '../lib/db/client.mjs';",
    "const db = open();",
    "const out = db.all('.mode list\\nSELECT name FROM sqlite_master WHERE type=\\'table\\' AND name=\\'secret\\';');",
    "console.log(String(out).includes('secret') ? 'OK' : 'NO');"
  ].join("\n");
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: process.cwd(), encoding: 'utf8' });
  const stdout = (child.stdout || '').trim();
  assert.equal(stdout, 'OK');
});
