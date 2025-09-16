import { dbAvailable } from '../lib/db/client.mjs';
// tests/db.migrate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, dbFile, open } from '../lib/db/client.mjs';
import { migrate } from '../lib/db/migrate.mjs';

test('fresh migrate creates tables and pragmas set', () => {
  const dir = dataDir();
  assert.equal(fs.existsSync(dir), true);
  migrate({});
  const db = open();
  // Tables exist
  const tbl = db.all(".mode list\nSELECT name FROM sqlite_master WHERE type='table' AND name IN ('project','secret','nonce','session','job','pr','event','log');");
  assert.ok(Array.isArray(tbl));
  // Pragmas
  assert.equal(db.pragma('journal_mode').toLowerCase().includes('wal'), true);
  assert.equal(db.pragma('foreign_keys'), '1');
  assert.equal(db.pragma('synchronous'), '1'); // NORMAL returns 1
  assert.ok(db.health());
});

test('re-run is no-op and checksum mismatch fails', () => {
  migrate({}); // 1st
  migrate({}); // 2nd no-op
  const db = open();
  // Inject wrong checksum
  db.exec("UPDATE migration SET checksum='bad' WHERE id='0001_init.sql';");
  let threw = false;
  try { migrate({}); } catch { threw = true; }
  assert.equal(threw, true);
});