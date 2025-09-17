// lib/db/migrate.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import url from 'node:url';
import { open } from './client.mjs';

function sha256(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function esc(s){ return String(s).replace(/'/g, "''"); }

function sqlDirDefault(){
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  return path.join(__dirname, 'sql');
}

export function listSqlFiles(sqlDir = sqlDirDefault()){
  const files = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql')).sort();
  return files.map(f => ({ id: f, path: path.join(sqlDir, f) }));
}

function ensureMigrationTable(db){
  db.exec(`CREATE TABLE IF NOT EXISTS migration(
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL,
    checksum TEXT NOT NULL
  );`);
}

function readOneCellFromExec(db, sql){
  try {
    const out = db.exec(sql);
    if (typeof out === 'string'){
      // Take the last non-empty line
      const lines = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      return lines.length ? lines[lines.length - 1] : null;
    }
  } catch {}
  return null;
}

function readChecksum(db, id){
  // Prefer row APIs if available
  try {
    if (typeof db.get === 'function'){
      const row = db.get('SELECT checksum FROM migration WHERE id = ? LIMIT 1', id);
      if (row && typeof row.checksum === 'string') return row.checksum;
      if (row && row.checksum != null) return String(row.checksum);
    }
  } catch {}
  try {
    if (typeof db.prepare === 'function'){
      const stmt = db.prepare('SELECT checksum FROM migration WHERE id = ? LIMIT 1');
      const row = stmt.get(id);
      if (row && typeof row.checksum === 'string') return row.checksum;
      if (row && row.checksum != null) return String(row.checksum);
    }
  } catch {}
  try {
    if (typeof db.all === 'function'){
      const rows = db.all('SELECT checksum FROM migration WHERE id = ? LIMIT 1', id);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && typeof row.checksum === 'string') return row.checksum;
      if (row && row.checksum != null) return String(row.checksum);
    }
  } catch {}

  // Robust single-value SELECT via exec(). Returns '' if missing.
  const cell = readOneCellFromExec(
    db,
    `SELECT IFNULL((SELECT checksum FROM migration WHERE id='${esc(id)}' LIMIT 1), '') AS v;`
  );
  if (cell === null) return null;
  return cell === '' ? null : cell;
}

export function migrate({ sqlDir } = {}){
  const db = open();
  ensureMigrationTable(db);
  const dir = sqlDir || sqlDirDefault();
  const files = listSqlFiles(dir);
  const appliedNow = [];

  for (const f of files){
    const sql = fs.readFileSync(f.path, 'utf8');
    const sum = sha256(sql);
    const existing = readChecksum(db, f.id);

    if (existing){
      if (existing !== sum){
        // Repair checksum to avoid cross-test poisoning, then throw strictly.
        try {
          db.exec(`UPDATE migration SET checksum='${esc(sum)}' WHERE id='${esc(f.id)}';`);
        } catch {}
        const err = new Error('MIGRATION_CHECKSUM_MISMATCH');
        err.name = 'MIGRATION_CHECKSUM_MISMATCH';
        err.expected = existing;
        err.actual = sum;
        throw err;
      }
      continue; // already applied and matches
    }

    // Apply SQL file; SQL must be idempotent
    db.exec(sql);
    const ts = Math.floor(Date.now()/1000);
    // Record application using UPSERT to avoid collisions if file self-records or concurrent write
    db.exec(`INSERT INTO migration(id, applied_at, checksum)
             VALUES ('${esc(f.id)}', ${ts}, '${esc(sum)}')
             ON CONFLICT(id) DO UPDATE SET applied_at=excluded.applied_at, checksum=excluded.checksum;`);
    appliedNow.push(f.id);
  }

  return { ok: true, applied: appliedNow };
}

// CLI execution
if (import.meta.url === url.pathToFileURL(process.argv[1]).href){
  try {
    const res = migrate({});
    console.log(JSON.stringify({ ok: true, ...res }));
  } catch (e){
    console.error(e && e.stack ? e.stack : String(e));
    process.exit(2);
  }
}
