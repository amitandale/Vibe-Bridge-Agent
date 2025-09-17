import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ensureDb, run, get } from './client.mjs';

const SQL_DIR = path.join(new URL(import.meta.url).pathname, '../db/sql');

export function _checksum(content){ return crypto.createHash('sha256').update(content,'utf8').digest('hex'); }

export function ensureMigrationsTable() {
  ensureDb();
  run(`
    CREATE TABLE IF NOT EXISTS migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

export function applyAll() {
  ensureMigrationsTable();
  const dir = path.join(new URL(import.meta.url).pathname, '../db/sql');
  const files = fs.readdirSync(dir).filter(f=>f.match(/^\d+.*\.sql$/)).sort();
  for (const f of files) {
    const p = path.join(dir, f);
    const content = fs.readFileSync(p,'utf8');
    const ch = _checksum(content);
    const existing = get('SELECT checksum FROM migration WHERE name = ?', [f]);
    if (existing && existing.checksum === ch) {
      // already applied and unchanged
      continue;
    }
    // apply inside transaction
    const db = ensureDb();
    db.prepare('BEGIN').run();
    try {
      db.exec(content);
      const now = Date.now();
      run('INSERT OR REPLACE INTO migration (name, checksum, applied_at) VALUES (?,?,?)', [f, ch, now]);
      db.prepare('COMMIT').run();
    } catch (err) {
      db.prepare('ROLLBACK').run();
      throw err;
    }
  }
}
