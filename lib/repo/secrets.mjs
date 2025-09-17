// lib/repo/secrets.mjs
// BA-03: DB-backed HMAC secrets; file-backed env values for mirror-only flows.
import { open } from '../db/client.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import { dirname } from 'node:path';

const ENV_FILE = './data/secrets.json';

function ensureEnvFileSync(){
  try { fs.statSync(ENV_FILE); }
  catch {
    fs.mkdirSync(dirname(ENV_FILE), { recursive: true });
    fs.writeFileSync(ENV_FILE, JSON.stringify({ env: {} }, null, 2));
  }
}
async function readEnv(){
  ensureEnvFileSync();
  try { return JSON.parse(await readFile(ENV_FILE, 'utf-8')); }
  catch { return { env: {} }; }
}
async function writeEnv(db){ await writeFile(ENV_FILE, JSON.stringify(db, null, 2)); }

// ---- Generic helpers kept for test compatibility ----
export function add({ kid, project_id, value }){
  if (!kid || !project_id || value == null) throw new Error('MISSING_FIELDS');
  const db = open();
  const now = Math.floor(Date.now()/1000);
  // Insert or replace by kid primary key
  db.exec(`INSERT OR REPLACE INTO secret(kid, project_id, type, value, active, created_at)
           VALUES ('${kid}','${project_id}','HMAC','${value}',1,${now});`);
}
export function set({ kid, value }){
  if (!kid || value == null) throw new Error('MISSING_FIELDS');
  const db = open();
  db.exec(`UPDATE secret SET value='${value}' WHERE kid='${kid}';`);
}
export function get(kid){
  const db = open();
  const rows = db.all(`.mode json
SELECT kid, project_id, value, active FROM secret WHERE kid='${kid}' LIMIT 1;`);
  try { return JSON.parse(rows || '[]')[0] || null; } catch { return null; }
}
export function remove(kid){
  const db = open();
  db.exec(`DELETE FROM secret WHERE kid='${kid}';`);
}
export function list(project_id){
  const db = open();
  const rows = db.all(`.mode json
SELECT kid, project_id, value, active FROM secret WHERE project_id='${project_id}';`);
  try { return JSON.parse(rows || '[]'); } catch { return []; }
}

// ---- HMAC-specific API used by security layer and tests ----
export async function setHmacKey({ projectId, kid, key }){
  if (!projectId || !kid || !key) throw new Error('MISSING_FIELDS');
  const db = open();
  const now = Math.floor(Date.now()/1000);
  db.exec(`INSERT OR REPLACE INTO secret(kid, project_id, type, value, active, created_at)
           VALUES ('${kid}','${projectId}','HMAC','${key}',1,${now});`);
  return { projectId, kid };
}
export async function setActiveHmacKid({ projectId, kid }){
  if (!projectId || !kid) throw new Error('MISSING_FIELDS');
  const db = open();
  // Single-active policy for now
  db.exec(`UPDATE secret SET active=0 WHERE project_id='${projectId}';`);
  db.exec(`UPDATE secret SET active=1, rotated_at=${Math.floor(Date.now()/1000)} WHERE kid='${kid}' AND project_id='${projectId}';`);
  return { projectId, kid };
}
export async function getActiveHmac(projectId){
  const arr = listActiveForProject(projectId);
  if (!arr.length) return null;
  const row = arr[0];
  return { kid: row.kid, key: row.value };
}
export function getByKid(kid){
  const db = open();
  const rows = db.all(`.mode json
SELECT kid, project_id, value FROM secret WHERE kid='${kid}' LIMIT 1;`);
  try {
    const row = (JSON.parse(rows || '[]')[0]) || null;
    if (!row) return null;
    return { projectId: row.project_id, kid: row.kid, value: row.value };
  } catch { return null; }
}
/** Return active HMAC secret(s) for a project. Shape: [{ project_id, kid, value }] */
export function listActiveForProject(project_id){
  if (!project_id) return [];
  const db = open();
  const rows = db.all(`.mode json
SELECT kid, project_id, value FROM secret WHERE project_id='${project_id}' AND active=1;`);
  try { return JSON.parse(rows || '[]'); } catch { return []; }
}

// ---- Env mirror API for CI sync (file-backed only) ----
export async function upsertEnv({ projectId, name, value, scope='global', lane='' }){
  if (!projectId || !name) throw new Error('MISSING_FIELDS');
  const db = await readEnv();
  const key = scope === 'lane' ? `${projectId}:${lane}:${name}` : `${projectId}:${name}`;
  db.env[key] = { projectId, name, value, scope, lane };
  await writeEnv(db);
  return { ok: true };
}
export function listMirrorable({ projectId, lane }){
  ensureEnvFileSync();
  try {
    const db = JSON.parse(fs.readFileSync(ENV_FILE, 'utf-8'));
    const out = [];
    for (const [k, rec] of Object.entries(db.env || {})){
      if (!rec || rec.projectId !== projectId) continue;
      if (rec.scope === 'lane' && rec.lane !== lane) continue;
      out.push(rec);
    }
    return out;
  } catch { return []; }
}
export function listMirrorableNames({ projectId, lane }){
  return listMirrorable({ projectId, lane }).map(r => r.name);
}
