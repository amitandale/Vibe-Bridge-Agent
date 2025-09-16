/**
 * lib/projects/disable.mjs
 * Project disable flag backed by DB project table.
 */
import { open } from '../db/client.mjs';

function esc(s){ return String(s).replaceAll("'", "''"); }

export async function isDisabled(projectId) {
  const id = String(projectId||'');
  if (!id) return false;
  try {
    const db = open();
    // Try get row directly if available
    if (typeof db.get === 'function'){
      const row = db.get(`SELECT disabled FROM project WHERE id='${esc(id)}' LIMIT 1;`);
      const val = (row && (row.disabled ?? (Array.isArray(row) ? row[0]?.disabled : undefined)));
      return Number(val||0) === 1;
    }
    // Fallback to exec with JSON mode
    const out = db.exec(`.mode json
.headers off
SELECT disabled FROM project WHERE id='${esc(id)}' LIMIT 1;`);
    const line = String(out||'').trim().split(/\r?\n/).filter(Boolean).pop() || '[]';
    const arr = JSON.parse(line);
    const val = (arr[0] && arr[0].disabled) || 0;
    return Number(val||0) === 1;
  } catch {
    return false;
  }
}

export async function setDisabled(projectId, flag) {
  const id = String(projectId||'');
  const v  = !!flag ? 1 : 0;
  const now = Math.floor(Date.now()/1000);
  const db = open();
  db.exec(`INSERT INTO project(id,name,disabled,created_at,updated_at) VALUES ('${esc(id)}','${esc(id)}',${v},${now},${now})
ON CONFLICT(id) DO UPDATE SET disabled=${v}, updated_at=${now};`);
  return v === 1;
}
