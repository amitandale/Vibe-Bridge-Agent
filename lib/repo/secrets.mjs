// lib/repo/secrets.mjs
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

const DATA_PATH = process.env.BA_LOCAL_STORE_PATH || './data/bridge-agent.local.json';

async function ensure(){
  try { await stat(DATA_PATH); }
  catch {
    await mkdir(dirname(DATA_PATH), { recursive: true });
    await writeFile(DATA_PATH, JSON.stringify({ hmac: {} }, null, 2));
  }
}
async function readStore(){
  await ensure();
  const buf = await readFile(DATA_PATH);
  return JSON.parse(String(buf||'{}') || '{}');
}
async function writeStore(db){
  await ensure();
  await writeFile(DATA_PATH, JSON.stringify(db, null, 2));
}

/* HMAC secret helpers */
export async function listByProject(projectId){
  const db = await readStore();
  const rec = db.hmac[projectId] || { byKid: {}, activeKid: null, prevKid: null, rotated_at: null, created_at: null };
  const out = [];
  for (const [kid, key] of Object.entries(rec.byKid || {})){
    const active = kid === rec.activeKid || kid === rec.prevKid;
    out.push({ project_id: projectId, kid, value: key, active, created_at: rec.created_at || 0, rotated_at: kid === rec.prevKid ? rec.rotated_at || 0 : null });
  }
  return out;
}

export async function getByKid(kid){
  const db = await readStore();
  for (const [projectId, rec] of Object.entries(db.hmac || {})){
    if (rec.byKid && rec.byKid[kid]){
      return { project_id: projectId, kid, value: rec.byKid[kid], active: (kid===rec.activeKid || kid===rec.prevKid), created_at: rec.created_at||0, rotated_at: kid===rec.prevKid ? rec.rotated_at||0 : null };
    }
  }
  return null;
}

export async function upsert({ project_id, kid, value, now = Date.now() }){
  if (!project_id || !kid || !value) throw new Error('MISSING_FIELDS');
  const db = await readStore();
  db.hmac[project_id] ||= { byKid: {}, activeKid: null, prevKid: null, created_at: Math.floor(now/1000), rotated_at: null };
  db.hmac[project_id].byKid[kid] = value;
  // Do not flip active automatically
  if (!db.hmac[project_id].activeKid) db.hmac[project_id].activeKid = kid;
  await writeStore(db);
  return { project_id, kid };
}

export async function rotate({ project_id, newKid, newKey, now = Date.now() }){
  if (!project_id || !newKid || !newKey) throw new Error('MISSING_FIELDS');
  const db = await readStore();
  db.hmac[project_id] ||= { byKid: {}, activeKid: null, prevKid: null, created_at: Math.floor(now/1000), rotated_at: null };
  const rec = db.hmac[project_id];
  if (rec.activeKid){
    rec.prevKid = rec.activeKid;
    rec.rotated_at = Math.floor(now/1000);
  }
  rec.byKid[newKid] = newKey;
  rec.activeKid = newKid;
  await writeStore(db);
  return { project_id, kid: newKid, previous: rec.prevKid };
}

export async function setActive({ project_id, kid }){
  if (!project_id || !kid) throw new Error('MISSING_FIELDS');
  const db = await readStore();
  db.hmac[project_id] ||= { byKid: {}, activeKid: null, prevKid: null, created_at: Math.floor(Date.now()/1000), rotated_at: null };
  if (!db.hmac[project_id].byKid[kid]) throw new Error('UNKNOWN_KID');
  db.hmac[project_id].activeKid = kid;
  await writeStore(db);
  return { project_id, kid };
}
