// lib/repo/jobs.mjs
import { open } from '../db/client.mjs';
export function queue({ id, session_id, type, state='queued', idempotency_key=null }){
  const db = open();
  const idem = idempotency_key ?? '';
  db.exec(`INSERT INTO job(id, session_id, type, state, idempotency_key)
           VALUES ('${id}','${session_id}','${type}','${state}','${idem}');`);
}
export function setState(id, state){
  const db = open();
  db.exec(`UPDATE job SET state='${state}' WHERE id='${id}';`);
}
