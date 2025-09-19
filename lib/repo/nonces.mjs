// lib/repo/nonces.mjs
import { open, dbAvailable } from '../db/client.mjs';

function esc(s){ return String(s).replaceAll("'", "''"); }
function nowSec(){ return Math.floor(Date.now()/1000); }

// In CI or when DB is unavailable, use an in-memory set to avoid long-lived handles.
const USE_MEMORY = (process.env.NODE_ENV === 'test') || (process.env.CI === 'true') || !dbAvailable();
const mem = new Map(); // id -> { seen, ttl_s, purpose }

function ensureSchema(db){
  try {
    db.exec("CREATE TABLE IF NOT EXISTS nonce (id TEXT PRIMARY KEY, purpose TEXT, seen_at INTEGER, ttl_s INTEGER);");
  } catch {}
}

function getRow(db, sql){
  try {
    if (typeof db.get === 'function') {
      const row = db.get(sql);
      if (row && typeof row === 'object') return row;
    }
  } catch {}
  try {
    const out = db.exec(sql);
    const rows = out?.rows || out?.[0]?.values || out?.[0]?.rows;
    const cols = out?.columns || out?.[0]?.columns || ['id','purpose','seen_at','ttl_s'];
    if (Array.isArray(rows) && rows.length) {
      const r = rows[0];
      if (Array.isArray(r)) {
        const obj = {};
        for (let i=0;i<Math.min(cols.length, r.length);i++) obj[cols[i]] = r[i];
        return obj;
      }
      return r;
    }
  } catch {}
  return null;
}

export function insertIfAbsent(id, { purpose = 'jwt', ttl_s = 300 } = {}){
  if (!id) return false;
  const now = nowSec();
  if (USE_MEMORY) {
    const rec = mem.get(id);
    if (rec && (rec.seen + rec.ttl_s) > now) return false;
    mem.set(id, { seen: now, ttl_s, purpose });
    return true;
  }
  const db = open();
  try {
    ensureSchema(db);
    const row = getRow(db, `SELECT id, seen_at, ttl_s FROM nonce WHERE id='${esc(id)}' LIMIT 1;`);
    if (row){
      const seen = Number(row.seen_at) || 0;
      const ttl  = Number(row.ttl_s) || 0;
      const expired = (seen + ttl) <= now;
      if (!expired) return false;
      try { db.exec(`DELETE FROM nonce WHERE id='${esc(id)}';`); } catch {}
    }
    db.exec(`INSERT OR REPLACE INTO nonce(id,purpose,seen_at,ttl_s) VALUES ('${esc(id)}','${esc(purpose)}',${now},${ttl_s});`);
    return true;
  } finally {
    try { if (typeof db.close === 'function') db.close(); } catch {}
  }
}
