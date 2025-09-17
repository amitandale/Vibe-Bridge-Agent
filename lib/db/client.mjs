// lib/db/client.mjs
import fs from 'node:fs';
import path from 'node:path';

let Database = null;
let _db = null;
let _available = false;

try {
  // lazy require to avoid throwing at import time in environments without native deps
  const mod = await import('better-sqlite3');
  Database = mod.default || mod;
  _available = typeof Database === 'function';
} catch { _available = false; }

export const dbAvailable = _available;

const DB_PATH = process.env.BRIDGE_DB_PATH || './data/bridge-agent.db';
export const dataDir = path.resolve(process.cwd(), path.dirname(DB_PATH));

export function ensureDataDir() {
  try { fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 }); } catch {}
  return dataDir;
}

export function ensureDb() {
  if (_db) return _db;
  ensureDataDir();
  if (!_available) {
    throw new Error('NO_DB'); // test suite checks this in some cases
  }
  _db = new Database(path.resolve(process.cwd(), DB_PATH));
  // Pragmas
  try { _db.pragma('journal_mode = WAL'); } catch {}
  try { _db.pragma('foreign_keys = ON'); } catch {}
  try { _db.pragma('synchronous = NORMAL'); } catch {}
  try { _db.pragma('temp_store = MEMORY'); } catch {}
  return _db;
}

// For modules that expect an open() that returns the db handle
export function open() { return ensureDb(); }

export function exec(sql) {
  const d = ensureDb();
  return d.exec(sql);
}

export function run(sql, params = []) {
  const d = ensureDb();
  const st = d.prepare(sql);
  return st.run(...(Array.isArray(params) ? params : [params]));
}

export function get(sql, params = []) {
  const d = ensureDb();
  const st = d.prepare(sql);
  return st.get(...(Array.isArray(params) ? params : [params])) || null;
}

export function all(sql, params = []) {
  const d = ensureDb();
  const st = d.prepare(sql);
  return st.all(...(Array.isArray(params) ? params : [params]));
}

export function transaction(fn) {
  const d = ensureDb();
  const t = d.transaction(fn);
  return (...args) => t(...args);
}

export function execSqlFile(filePath) {
  const d = ensureDb();
  const sql = fs.readFileSync(filePath, 'utf8');
  return d.exec(sql);
}
