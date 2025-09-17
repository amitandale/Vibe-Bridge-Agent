import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DB_PATH = process.env.BRIDGE_DB_PATH || './data/bridge-agent.db';
const DB_DIR = path.dirname(DB_PATH);

let db = null;

export function ensureDb() {
  if (db) return db;
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { mode: 0o700, recursive: true });
  }
  db = new Database(DB_PATH);
  // pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  return db;
}

export function run(sql, params=[]) {
  const d = ensureDb();
  const st = d.prepare(sql);
  return st.run(...(Array.isArray(params) ? params : [params]));
}

export function get(sql, params=[]) {
  const d = ensureDb();
  const st = d.prepare(sql);
  return st.get(...(Array.isArray(params) ? params : [params]));
}

export function all(sql, params=[]) {
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
