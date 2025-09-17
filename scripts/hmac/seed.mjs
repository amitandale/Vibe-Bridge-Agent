
// scripts/hmac/seed.mjs
import { open } from '../../lib/db/client.mjs';

const projectId = process.env.BOOTSTRAP_PROJECT_ID;
const kid = process.env.BOOTSTRAP_HMAC_KID;
const key = process.env.BOOTSTRAP_HMAC_KEY;

if (!projectId || !kid || !key){
  console.error('missing BOOTSTRAP_PROJECT_ID or BOOTSTRAP_HMAC_KID or BOOTSTRAP_HMAC_KEY');
  process.exit(2);
}
function esc(s){ return String(s).replace(/'/g, "''"); }
const db = open();
db.exec(`INSERT OR IGNORE INTO project(id, name, created_at, updated_at) VALUES ('${esc(projectId)}','${esc(projectId)}',strftime('%s','now'),strftime('%s','now'));`);
const id = 'sec_'+Math.random().toString(36).slice(2);
db.exec(`INSERT INTO secret(id,kid,project_id,type,value,created_at,active) VALUES ('${id}', '${esc(kid)}', '${esc(projectId)}', 'HMAC', '${esc(key)}', strftime('%s','now'), 1);`);
console.log('seeded hmac key for', projectId, 'kid', kid);
