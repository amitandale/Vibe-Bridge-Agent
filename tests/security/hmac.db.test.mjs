
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../../lib/db/migrate.mjs';
import { open, dbAvailable } from '../../lib/db/client.mjs';
import { sign, verifySignature, _clearStore } from '../../lib/security/hmac.mjs';

function esc(s){ return String(s).replace(/'/g, "''"); }

test('DB-backed HMAC verify and rotation grace', () => {
  if (!dbAvailable()) return;
  _clearStore();
  migrate({});
  const db = open();
  const pid = 'proj-db';
  const kid1 = 'k1';
  const key1 = 's1';
  db.exec(`INSERT OR IGNORE INTO project(id,name,created_at,updated_at) VALUES ('${esc(pid)}','${esc(pid)}', strftime('%s','now'), strftime('%s','now'));`);
  const id1 = 'sec_'+Math.random().toString(36).slice(2);
  db.exec(\`INSERT INTO secret(id,kid,project_id,type,value,created_at,active) VALUES ('\${id1}','\${kid1}','\${pid}','HMAC','\${key1}',strftime('%s','now'),1);\`);

  const raw = Buffer.from('{"x":1}');
  const sig1 = sign(raw, key1);
  const v1 = verifySignature({ projectId: pid, kid: kid1, signature: sig1, raw });
  assert.equal(v1.ok, true);
  assert.equal(v1.used, 'current');

  // Rotate to k2 and ensure k1 allowed within grace
  const id2 = 'sec_'+Math.random().toString(36).slice(2);
  const kid2 = 'k2';
  const key2 = 's2';
  db.exec(\`UPDATE secret SET active=0, rotated_at=strftime('%s','now') WHERE project_id='\${pid}' AND kid='\${kid1}';\`);
  db.exec(\`INSERT INTO secret(id,kid,project_id,type,value,created_at,active) VALUES ('\${id2}','\${kid2}','\${pid}','HMAC','\${key2}',strftime('%s','now'),1);\`);

  const sigOld = sign(raw, key1);
  const vGrace = verifySignature({ projectId: pid, kid: kid1, signature: sigOld, raw }, { grace_s: 30 });
  assert.equal(vGrace.ok, true);
  assert.equal(vGrace.used, 'previous');

  // After grace expired reject old
  const now = Date.now() + 61_000;
  const vExpired = verifySignature({ projectId: pid, kid: kid1, signature: sigOld, raw }, { grace_s: 60, now });
  assert.equal(vExpired.ok, false);
  assert.equal(vExpired.code, 'ERR_HMAC_MISSING');
});
