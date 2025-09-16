// lib/workspace/capacity.wire.mjs
import { nproc, memFreeMB } from './sys.host.mjs';
import { parseSsListeners } from './net.host.mjs';
import { extractComposeProjects } from './docker.host.mjs';
import { statFS } from './fs.host.mjs';
import { checkCapacity } from './capacity.mjs';

/** Build real adapters from host for capacity checks. exec: optional command runner, readFile: optional reader */
export function makeCapacityAdapters({ exec, readFile } = {}){
  return {
    sys: {
      nproc: async ()=> await nproc(),
      memFreeMB: async ()=> await memFreeMB({})
    },
    ports: {
      isFree: async (port)=>{
        const out = await (exec ? exec('ss',['-lntp']) : Promise.resolve(''));
        const rows = parseSsListeners(out);
        return !rows.some(r => r.port === Number(port));
      }
    },
    // optional: compose projects snapshot for diagnostics
    async composeSnapshot(){
      const out = await (exec ? exec('docker',['ps','--format','{{.Labels}}']) : Promise.resolve(''));
      return extractComposeProjects(out);
    },
    async fsSnapshot({ mount='/' } = {}){
      try { return await statFS({ mount, exec }); } catch { return null; }
    }
  };
}

/** Ensure capacity before compose/render. Honors CAPACITY_CHECKS_DISABLED and CAP_* env thresholds. */
export async function ensureCapacityBeforeCompose({ desiredPorts=[] } = {}, { exec, readFile, env = process.env } = {}){
  if (String(env.CAPACITY_CHECKS_DISABLED||'').toLowerCase() === 'true') return { ok:true, code:'DISABLED' };
  const adapters = makeCapacityAdapters({ exec, readFile });
  const res = await checkCapacity(adapters, { desiredPorts });
  return res;
}
