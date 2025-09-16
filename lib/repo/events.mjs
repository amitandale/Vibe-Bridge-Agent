// lib/repo/events.mjs
import { open } from '../db/client.mjs';
export function append({ id, project_id, ts = Math.floor(Date.now()/1000), payload_json='{}' }){
  const db = open();
  db.exec(`INSERT INTO event(id, project_id, ts, payload_json) VALUES ('${id}','${project_id}',${ts},'${payload_json}');`);
}
