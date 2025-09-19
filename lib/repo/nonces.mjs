// lib/repo/nonces.mjs
import { open } from '../db/client.mjs';

function esc(s){ return String(s).replaceAll("'", "''"); }

function getRow(db, sql){
  // Try row API
  try {
    if (typeof db.get === 'function'){
      const row = db.get(sql);
      if (row && typeof row === 'object') return row;
      if (typeof row === 'string'){
        try {
          const arr = JSON.parse(row);
          if (Array.isArray(arr)) return arr[0] || null;
        } catch {}
      }
    }
  } catch {}
  // Fallback: try .exec() that returns JSON
  try {
    const out = db.exec(sql);
    if (out && typeof out === 'object'){
      const rows = out.rows || out[0]?.values || out[0]?.rows;
      if (Array.isArray(rows) && rows.length > 0){
        const row = rows[0];
        // Map array to keyed object if needed
        if (Array.isArray(row)){
          const cols = out.columns || out[0]?.columns || ['id','purpose','seen_at','ttl_s'];
          const obj = {};
          for (let i=0;i<Math.min(cols.length, row.length);i++) obj[cols[i]] = row[i];
          return obj;
        }
        return row;
      }
    }
  } catch {}
  return null;
}

function ensureSchema(db){
  try {
    db.exec("CREATE TABLE IF NOT EXISTS nonce (id TEXT PRIMARY KEY, purpose TEXT, seen_at INTEGER, ttl_s INTEGER);");
  } catch {}
}

export function insertIfAbsent(id, { purpose = 'jwt', ttl_s = 300 } = {}){
  if (!id) return false;
  const db = open();
  ensureSchema(db);
  const now = Math.floor(Date.now()/1000);
  const row = getRow(db, `SELECT id, seen_at, ttl_s FROM nonce WHERE id='${esc(id)}' LIMIT 1;`);
  if (row){
    const seen = Number(row.seen_at) || 0;
    const ttl  = Number(row.ttl_s) || 0;
    const expired = (seen + ttl) <= now;
    if (!expired) return false;
    // expired: reclaim id
    try { db.exec(`DELETE FROM nonce WHERE id='${esc(id)}';`); } catch {}
  }
  // Insert fresh
  db.exec(`INSERT OR REPLACE INTO nonce(id,purpose,seen_at,ttl_s) VALUES ('${esc(id)}','${esc(purpose)}',${now},${ttl_s});`);
  return true;
}
