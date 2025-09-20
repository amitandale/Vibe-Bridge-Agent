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
  // Fallback: exec JSON
  try {
    if (typeof db.exec === 'function'){
      const out = db.exec(`.mode json
.headers off
${sql}`);
      if (typeof out === 'string'){
        const line = out.trim().split(/[\r\n]+/).filter(Boolean).pop();
        try {
          const arr = JSON.parse(line);
          if (Array.isArray(arr)) return arr[0] || null;
        } catch {}
      }
    }
  } catch {}
  return null;
}

export function insertIfAbsent(id, { purpose='ticket', ttl_s=3600 } = {}){
  const db = open();
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
