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
    )`);
}

export function applyAll() {
  ensureMigrationsTable();
  if (!fs.existsSync(SQL_DIR)) return;
  const files = fs.readdirSync(SQL_DIR).filter(f => f.endsWith('.sql')).sort((a,b)=>a.localeCompare(b));
  for (const f of files) {
    const full = path.join(SQL_DIR, f);
    const content = fs.readFileSync(full, 'utf8');
    const ch = _checksum(content);
    const row = get('SELECT checksum FROM migration WHERE name=?', [f]);
    if (row && row.checksum === ch) continue;

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

// Provide the named export expected by tests without changing behavior.
export { applyAll as migrate };
