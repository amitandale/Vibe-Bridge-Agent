// lib/repo/secrets.mjs
import { open } from '../db/client.mjs';

function esc(s){ return String(s).replaceAll("'", "''"); }

function getRow(sql){
  const db = open();
  // Row API
  try {
    if (typeof db.get === 'function'){
      const row = db.get(sql);
      if (row && typeof row === 'object') return row;
      if (typeof row === 'string'){
        try { const arr = JSON.parse(row); if (Array.isArray(arr)) return arr[0] || null; } catch {}
      }
    }
  } catch {}
  // CLI JSON fallback
  try {
    if (typeof db.exec === 'function'){
      const out = db.exec(`.mode json
.headers off
${sql}`);
      if (typeof out === 'string'){
        const line = out.trim().split(/[\r\n]+/).filter(Boolean).pop();
        const arr = JSON.parse(line);
        return Array.isArray(arr) ? arr[0] || null : null;
      }
    }
  } catch {}
  return null;
}

function getRows(sql){
  const db = open();
  // Prefer row APIs if available (not standard across adapters, so fallback likely)
  try {
    if (typeof db.all === 'function'){
      const rows = db.all(sql);
      if (Array.isArray(rows)) return rows;
    }
  } catch {}
  // CLI JSON fallback
  try {
    if (typeof db.exec === 'function'){
      const out = db.exec(`.mode json
.headers off
${sql}`);
      if (typeof out === 'string'){
        const line = out.trim().split(/[\r\n]+/).filter(Boolean).pop();
        const arr = JSON.parse(line);
        return Array.isArray(arr) ? arr : [];
      }
    }
  } catch {}
  return [];
}

export function upsert({ id, project_id, kid, value, active=1 }){
  const now = Math.floor(Date.now()/1000);
  const db = open();
  db.exec(`INSERT INTO secret(id, project_id, kid, value, active, created_at)
           VALUES ('${esc(id)}','${esc(project_id)}','${esc(kid)}','${esc(value)}',${active},${now})
           ON CONFLICT(id) DO UPDATE SET value=excluded.value, active=excluded.active;`);
}

export function add({ id, project_id, kid, value, active=1 }){
  const sid = id ?? `${project_id}:${kid}`;
  return upsert({ id: sid, project_id, kid, value, active });
}

export function get(id){
  return getRow(`SELECT * FROM secret WHERE id='${esc(id)}' LIMIT 1;`);
}

export function getByKid(kid){
  // Return the latest active secret for kid if multiple exist
  return getRow(`SELECT * FROM secret WHERE kid='${esc(kid)}' AND active=1 ORDER BY created_at DESC LIMIT 1;`);
}

export function listActiveForProject(project_id){
  return getRows(`SELECT * FROM secret WHERE project_id='${esc(project_id)}' AND active=1 ORDER BY created_at DESC;`);
}
