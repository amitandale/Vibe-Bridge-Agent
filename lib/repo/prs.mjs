// lib/repo/prs.mjs
import { open } from '../db/client.mjs';
export function upsert({ id, project_id, branch, url=null, state='open', last_commit=null }){
  const db = open();
  const u = url ?? '';
  const lc = last_commit ?? '';
  db.exec(`INSERT INTO pr(id, project_id, branch, url, state, last_commit)
           VALUES ('${id}','${project_id}','${branch}','${u}','${state}','${lc}')
           ON CONFLICT(id) DO UPDATE SET url=excluded.url, state=excluded.state, last_commit=excluded.last_commit;`);
}
