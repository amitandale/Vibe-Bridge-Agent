
// scripts/hmac/rotate.mjs
import { open } from '../../lib/db/client.mjs';

const projectId = process.argv[2];
const newKid = process.argv[3];
const newKey = process.argv[4];

if (!projectId || !newKid || !newKey){
  console.error('usage: node scripts/hmac/rotate.mjs <projectId> <newKid> <newKey>');
  process.exit(2);
}
function esc(s){ return String(s).replace(/'/g, "''"); }
const db = open();
db.exec(`UPDATE secret SET active=0, rotated_at=strftime('%s','now') WHERE project_id='${esc(projectId)}' AND active=1;`);
const id = 'sec_'+Math.random().toString(36).slice(2);
db.exec(`INSERT INTO secret(id,kid,project_id,type,value,created_at,active) VALUES ('${id}','${esc(newKid)}','${esc(projectId)}','HMAC','${esc(newKey)}',strftime('%s','now'),1);`);
console.log('rotated hmac key for', projectId, 'new kid', newKid);
