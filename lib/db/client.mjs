// lib/db/client.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DATA_DIR = path.resolve(process.cwd(), 'data');

function deriveDbFileFromEnv(){
  const u = process.env.DATABASE_URL || "";
  if (!u) return null;
  try {
    if (u.startsWith("file:"))   return u.slice(5);
    if (u.startsWith("sqlite:")) return u.slice(7);
  } catch (e) {}
  return null;
}

const DB_FILE = process.env.BRIDGE_DB_FILE || deriveDbFileFromEnv() || path.join(DATA_DIR, 'bridge-agent.db');

function ensureDirSecure(dir = DATA_DIR){
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try { fs.chmodSync(dir, 0o700); } catch {}
}

function hasSqlite3Binary(){
  try {
    const res = spawnSync('sqlite3', ['-version'], { encoding: 'utf-8' });
    return res.status === 0;
  } catch (e) { return false; }
}

function runSqlViaCli(sql){
  // Options must precede database filename. Use -cmd to apply pragmas per process.
  const args = ['-batch', '-cmd', 'PRAGMA foreign_keys=ON;', '-cmd', 'PRAGMA synchronous=NORMAL;', DB_FILE];
  const res = spawnSync('sqlite3', args, { input: sql, encoding: 'utf-8' });
  if (res.status !== 0) {
    const err = new Error(res.stderr || 'sqlite3 error');
    err.stderr = res.stderr;
    throw err;
  }
  return res.stdout || '';
}

export function open(){
  ensureDirSecure();
  // Ensure DB directory exists if DB_FILE points elsewhere
  try {
    const dir = path.dirname(DB_FILE);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
  if (!hasSqlite3Binary()) {
    return {
      exec(){ throw new Error('NO_DB'); },
      all(){ throw new Error('NO_DB'); },
      get(){ throw new Error('NO_DB'); },
      pragma(){ throw new Error('NO_DB'); },
      health(){ return false; },
      _noDb: true,
    };
  }
  // Ensure file exists
  try { fs.closeSync(fs.openSync(DB_FILE, 'a')); } catch (e) {}
  // Apply safe defaults
  try {
    runSqlViaCli([
      "PRAGMA journal_mode=WAL;",
      "PRAGMA foreign_keys=ON;",
      "PRAGMA synchronous=NORMAL;"
    ].join("\n"));
  } catch (e) {
    const err = new Error('NO_DB');
    err.cause = e;
    throw err;
  }
  return {
    exec(sql){ return runSqlViaCli(sql); },
    all(sql){
      const out = runSqlViaCli(".mode list\n" + sql);
      const lines = String(out).trim() === "" ? [] : String(out).trim().split(/\r?\n/);
      return lines;
    },
    get(sql){
      const out = runSqlViaCli(".mode list\n" + sql).trim().split(/\r?\n/);
      return out.length ? out[0] : "";
    },
    pragma(name){
      const out = runSqlViaCli(".mode list\nPRAGMA " + name + ";").trim().split(/\r?\n/);
      return out.length ? out[out.length-1] : "";
    },
    health(){
      const ts = Date.now();
      runSqlViaCli("CREATE TABLE IF NOT EXISTS __health (ts INTEGER);");
      runSqlViaCli(`INSERT INTO __health(ts) VALUES (${ts});`);
      const got = runSqlViaCli("SELECT ts FROM __health ORDER BY ts DESC LIMIT 1;").trim();
      return String(got) !== "" && Number.parseInt(got,10) >= ts;
    },
    _noDb: false,
  };
}

export function dataDir(){ ensureDirSecure(); return DATA_DIR; }
export function dbFile(){ ensureDirSecure(); return DB_FILE; }
export function dbAvailable(){
  // Side-effect free readiness probe
  if (!hasSqlite3Binary()) return false;
  try {
    ensureDirSecure();
    const dir = path.dirname(DB_FILE);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir || DATA_DIR, fs.constants.W_OK);
    return true;
  } catch (e) { return false; }
}



// BA-03: run migrations at process start unless disabled. Uses CLI wrapper to avoid import cycles.
// Hardened: short timeout and error swallowing to avoid any test hang.
try {
  if (process.env.DB_MIGRATE_ON_BOOT !== '0') {
    const res = spawnSync(process.execPath, ['scripts/db/migrate.mjs'], {
      stdio: 'ignore',
      timeout: 5000,   // hard cap 5s
      killSignal: 'SIGKILL'
    });
    // If timed out or errored, continue without blocking tests
  }
} catch {}


