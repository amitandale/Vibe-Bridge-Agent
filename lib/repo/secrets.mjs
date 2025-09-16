// lib/repo/secrets.mjs
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

// --- Sync helpers for mapper compatibility ---
import fs from 'node:fs';

function ensureFileSync() {
  try { fs.statSync(DATA_PATH); }
  catch {
    fs.mkdirSync(dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify({ hmac: {}, env: {} }, null, 2));
  }
}
function readStoreSync(){
  ensureFileSync();
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw || '{"hmac":{},"env":{}}');
}
function writeStoreSync(db){
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
}


const DATA_PATH = './data/secrets.json';

async function ensureFile() {
  try { await stat(DATA_PATH); }
  catch {
    await mkdir(dirname(DATA_PATH), { recursive: true });
    await writeFile(DATA_PATH, JSON.stringify({ hmac: {}, env: {} }, null, 2));
  }
}

async function readStore(){
  await ensureFile();
  const raw = await readFile(DATA_PATH, 'utf8');
  try { return JSON.parse(raw); } catch { return { hmac: {}, env: {} }; }
}

async function writeStore(obj){
  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(obj, null, 2));
}

/** Guard: never mirror LLM provider keys into GitHub Actions. */
export function isMirrorable(name=''){
  const deny = ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_API_KEY','GEMINI_API_KEY','MISTRAL_API_KEY','LLM_API_KEY'];
  return !deny.includes(String(name).toUpperCase());
}

/* ================= HMAC ops ================= */
export async function setHmacKey({ projectId, kid, key }){
  if (!projectId || !kid || !key) throw new Error('MISSING_FIELDS');
  const db = await readStore();
  db.hmac[projectId] ||= { activeKid: null, byKid: {} };
  db.hmac[projectId].byKid[kid] = key;
  await writeStore(db);
  return { projectId, kid };
}

export async function setActiveHmacKid({ projectId, kid }){
  if (!projectId || !kid) throw new Error('MISSING_FIELDS');
  const db = await readStore();
  const row = db.hmac[projectId];
  if (!row || !row.byKid[kid]) { const e = new Error('KID_NOT_FOUND'); e.code='KID_NOT_FOUND'; throw e; }
  row.activeKid = kid;
  await writeStore(db);
  return { projectId, kid };
}

export async function getActiveHmac(projectId){
  const db = await readStore();
  const row = db.hmac[projectId];
  if (!row || !row.activeKid) return null;
  const kid = row.activeKid;
  const key = row.byKid[kid];
  if (!key) return null;
  return { kid, key };
}

export function getByKid(kid){
  if (!kid) return null;
  const db = readStoreSync();
  for (const [pid, rec] of Object.entries(db.hmac)){
    if (rec.byKid && rec.byKid[kid]) {
      const val = rec.byKid[kid];
      return { projectId: pid, kid, key: val, value: val };
    }
  }
  return null;
}

/* ================= Env ops ================= */
export async function upsertEnv({ projectId, name, value, scope='lane', lane } = {}){
  if (!projectId || !name) throw new Error('MISSING_FIELDS');
  const db = await readStore();
  db.env[projectId] ||= { global: {}, lanes: {} };
  if (scope === 'global'){
    db.env[projectId].global[name] = value;
  } else {
    if (!lane) throw new Error('MISSING_LANE');
    db.env[projectId].lanes[lane] ||= {};
    db.env[projectId].lanes[lane][name] = value;
  }
  await writeStore(db);
  return { projectId, name, scope, lane };
}

export async function deleteEnv({ projectId, name, scope='lane', lane } = {}){
  if (!projectId || !name) throw new Error('MISSING_FIELDS');
  const db = await readStore();
  const rec = db.env[projectId];
  if (!rec) return { ok: true };
  if (scope === 'global'){
    if (rec.global) delete rec.global[name];
  } else if (lane && rec.lanes[lane]) {
    delete rec.lanes[lane][name];
  }
  await writeStore(db);
  return { ok: true };
}

export async function getEnvForLane(projectId, lane){
  const db = await readStore();
  const rec = db.env[projectId] || { global: {}, lanes: {} };
  return { ...rec.global, ...(rec.lanes[lane] || {}) };
}

export async function listMirrorableNames(projectId, lane){
  const env = await getEnvForLane(projectId, lane);
  return Object.keys(env).filter(isMirrorable);
}

/* ===== Generic mapper facade expected by repo.mappers tests =====
 * Semantics:
 *  - add/set without lane -> global
 *  - add/set with lane -> lane-specific
 *  - get without lane -> global only
 *  - get with lane -> merged(global,lane)
 *  - list without lane -> global only
 *  - list with lane -> merged(global,lane)
 *  - remove respects lane presence
 */

export function add({ kid, project_id, value, projectId, name, lane } = {}){
  // Dual-mode:
  //  - If kid+project_id present -> HMAC insert for mapper tests.
  //  - Else fallback to env upsert (global or lane).
  if (kid && project_id){
    const db = readStoreSync();
    db.hmac[project_id] ||= { activeKid: kid, byKid: {} };
    db.hmac[project_id].byKid[kid] = value;
    if (!db.hmac[project_id].activeKid) db.hmac[project_id].activeKid = kid;
    writeStoreSync(db);
    return { project_id, kid, value };
  }
  // Env path: maintain previous behavior
  const scope = lane ? 'lane' : 'global';
  // Defer to async upsertEnv but run synchronously is not possible; write directly:
  if (!projectId || !name) throw new Error('MISSING_FIELDS');
  const db = readStoreSync();
  db.env[projectId] ||= { global: {}, lanes: {} };
  if (scope === 'global'){ db.env[projectId].global[name] = value; }
  else { db.env[projectId].lanes[lane] ||= {}; db.env[projectId].lanes[lane][name] = value; }
  writeStoreSync(db);
  return { projectId, name, value, scope, lane };
}
export async function set({ projectId, name, value, lane } = {}){
  const scope = lane ? 'lane' : 'global';
  return upsertEnv({ projectId, name, value, scope, lane });
}
export async function get({ projectId, name, lane } = {}){
  if (!projectId || !name) throw new Error('MISSING_FIELDS');
  if (lane){
    const env = await getEnvForLane(projectId, lane);
    return env[name];
  } else {
    const db = await readStore();
    return (db.env[projectId]?.global || {})[name];
  }
}
export async function remove({ projectId, name, lane } = {}){
  const scope = lane ? 'lane' : 'global';
  return deleteEnv({ projectId, name, scope, lane });
}
export async function list({ projectId, lane } = {}){
  if (lane){
    const env = await getEnvForLane(projectId, lane);
    return Object.entries(env).map(([k,v]) => ({ name: k, value: v }));
  } else {
    const db = await readStore();
    const env = (db.env[projectId]?.global) || {};
    return Object.entries(env).map(([k,v]) => ({ name: k, value: v }));
  }
}

/** Mapper-compat: return active HMAC secret for a project as a list.
 * Shape: [{ project_id, kid, value }] to satisfy repo.mappers tests.
 */
export function listActiveForProject(project_id){
  if (!project_id) return [];
  const db = readStoreSync();
  const rec = db.hmac[project_id];
  if (!rec || !rec.activeKid) return [];
  const kid = rec.activeKid;
  const val = rec.byKid?.[kid];
  if (!val) return [];
  return [{ project_id, kid, value: val }];
}