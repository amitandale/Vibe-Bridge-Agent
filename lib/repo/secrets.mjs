// lib/repo/secrets.mjs
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';

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

/** ===== HMAC ops (BA-14) ===== */
export async function setHmacKey({ projectId, kid, key }){
  if (!projectId || !kid || !key) throw new Error('MISSING_FIELDS');
  const db = await readStore();
  db.hmac[projectId] ||= { activeKid: null, byKid: {} };
  db.hmac[projectId].byKid[kid] = key; // overwrite allowed
  await writeStore(db);
  return { projectId, kid };
}

export async function setActiveHmacKid({ projectId, kid }){
  if (!projectId || !kid) throw new Error('MISSING_FIELDS');
  const db = await readStore();
  const row = db.hmac[projectId];
  if (!row || !row.byKid[kid]) {
    const e = new Error('KID_NOT_FOUND'); e.code = 'KID_NOT_FOUND'; throw e;
  }
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

export async function getByKid(kid){
  if (!kid) return null;
  const db = await readStore();
  for (const [pid, rec] of Object.entries(db.hmac)){
    if (rec.byKid && rec.byKid[kid]) return { projectId: pid, kid, key: rec.byKid[kid] };
  }
  return null;
}

/** ===== Env ops (BA-14) ===== */
/** Upsert an env secret. scope can be 'lane' or 'global'. For lane, provide lane. */
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

/** Delete env secret */
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

/** Retrieve env map for a lane. Global merged with lane-specific. */
export async function getEnvForLane(projectId, lane){
  const db = await readStore();
  const rec = db.env[projectId] || { global: {}, lanes: {} };
  return { ...rec.global, ...(rec.lanes[lane] || {}) };
}

/** List mirrorable names for a lane based on stored env. */
export async function listMirrorableNames(projectId, lane){
  const env = await getEnvForLane(projectId, lane);
  return Object.keys(env).filter(isMirrorable);
}

/** ===== Generic mapper facade for tests expecting CRUD like {add,get,set,remove,list} ===== */
export async function add({ projectId, name, value, scope='lane', lane } = {}){
  return upsertEnv({ projectId, name, value, scope, lane });
}
export async function set({ projectId, name, value, scope='lane', lane } = {}){
  return upsertEnv({ projectId, name, value, scope, lane });
}
export async function get({ projectId, name, lane, scope='lane' } = {}){
  if (!projectId || !name) throw new Error('MISSING_FIELDS');
  const env = await getEnvForLane(projectId, lane || 'ci');
  return env[name];
}
export async function remove({ projectId, name, scope='lane', lane } = {}){
  return deleteEnv({ projectId, name, scope, lane });
}
export async function list({ projectId, lane } = {}){
  const env = await getEnvForLane(projectId, lane || 'ci');
  return Object.entries(env).map(([k, v]) => ({ name: k, value: v }));
}
