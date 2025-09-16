// lib/runner/state.fs.mjs
// File-backed retry state with prune. Safe for tests via storePath override.
import fs from 'node:fs/promises';
import path from 'node:path';

function nowS(){ return Math.floor(Date.now()/1000); }

async function load(storePath){
  try { const txt = await fs.readFile(storePath, 'utf8'); return JSON.parse(txt); } catch { return {}; }
}
async function save(storePath, obj){
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(obj), 'utf8');
}

export function makeState({ storePath = './data/runner-retry-state.json' } = {}){
  return {
    async getRetryState(name){
      const db = await load(storePath);
      return db[name] || { failures: 0, lastAttemptEpochS: 0 };
    },
    async setRetryState(name, st){
      const db = await load(storePath);
      db[name] = { failures: st.failures|0, lastAttemptEpochS: st.lastAttemptEpochS || nowS() };
      await save(storePath, db);
      return db[name];
    },
    async pruneRetryState({ maxAgeS = 7*24*3600 } = {}){
      const db = await load(storePath);
      const cutoff = nowS() - maxAgeS;
      for (const [k,v] of Object.entries(db)){
        if ((v.lastAttemptEpochS||0) < cutoff) delete db[k];
      }
      await save(storePath, db);
      return { ok:true };
    }
  };
}
