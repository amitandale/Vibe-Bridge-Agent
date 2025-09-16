// lib/repo/logs.mjs
import { open } from '../db/client.mjs';
export function append({ project_id, chan='app', ts = Math.floor(Date.now()/1000), level='info', message, meta_json=null }){
  const db = open();
  const msg = String(message).replaceAll("'","''");
  const meta = meta_json ?? '';
  db.exec(`INSERT INTO log(project_id, chan, ts, level, message, meta_json)
           VALUES ('${project_id}','${chan}',${ts},'${level}','${msg}','${meta}');`);
}
