// lib/repo/projects.mjs
import { open } from '../db/client.mjs';

function esc(s){ return String(s).replaceAll("'", "''"); }

function getRow(sql){
  const db = open();
  // Preferred: native row APIs
  try {
    if (typeof db.get === 'function'){
      const row = db.get(sql);
      if (row && typeof row === 'object') return row;
      if (typeof row === 'string'){
        try { const arr = JSON.parse(row); if (Array.isArray(arr)) return arr[0] || null; } catch {}
      }
    }
  } catch {}
  // Fallback: CLI via exec() with JSON mode
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

export function upsert({ id, name, repo_owner=null, repo_name=null, disabled=0 }){
  const now = Math.floor(Date.now()/1000);
  const db = open();
  const owner = repo_owner ?? '';
  const rname = repo_name ?? '';
  db.exec(`INSERT INTO project(id,name,repo_owner,repo_name,disabled,created_at,updated_at)
           VALUES ('${esc(id)}','${esc(name)}','${esc(owner)}','${esc(rname)}',${disabled},${now},${now})
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, repo_owner=excluded.repo_owner, repo_name=excluded.repo_name, disabled=excluded.disabled, updated_at=${now};`);
}

export function get(id){
  const sql = `SELECT * FROM project WHERE id='${esc(id)}' LIMIT 1;`;
  return getRow(sql);
}

export function setDisabled(id, disabled){
  const db = open();
  const now = Math.floor(Date.now()/1000);
  db.exec(`UPDATE project SET disabled=${disabled?1:0}, updated_at=${now} WHERE id='${esc(id)}';`);
}
