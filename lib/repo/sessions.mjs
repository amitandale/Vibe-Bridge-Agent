// lib/repo/sessions.mjs
import { open } from '../db/client.mjs';
export function create({ id, project_id, pr_budget=0, per_pr_ms=0, roster_json='[]', duration_ms=0, status='running' }){
  const now = Math.floor(Date.now()/1000);
  const db = open();
  db.exec(`INSERT INTO session(id, project_id, started_at, duration_ms, pr_budget, per_pr_ms, roster_json, status)
           VALUES ('${id}','${project_id}',${now},${duration_ms},${pr_budget},${per_pr_ms},'${roster_json}','${status}');`);
}
export function setStatus(id, status){
  const db = open();
  db.exec(`UPDATE session SET status='${status}' WHERE id='${id}';`);
}
