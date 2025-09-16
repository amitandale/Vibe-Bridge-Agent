// lib/runner/systemd.adapter.mjs
// Parse local systemd state for github-runner@<project>-<lane>.service
import { spawn } from 'node:child_process';

/** Exec helper with injectable implementation for tests */
function sh(cmd, args, exec){
  return new Promise((resolve, reject)=>{
    if (exec){
      Promise.resolve(exec(cmd, args)).then(resolve).catch(reject);
      return;
    }
    const p = spawn(cmd, args, { stdio:['ignore','pipe','pipe'] });
    let out = '', err='';
    p.stdout.on('data', d=> out+=d);
    p.stderr.on('data', d=> err+=d);
    p.on('close', (code)=> code===0 ? resolve(out) : reject(new Error(err || `exit ${code}`)));
  });
}

/** Return [{ name, projectId, lane, state, lastSeenEpochS }] */
export async function listLocal({ exec } = {}){
  const now = Math.floor(Date.now()/1000);
  const out = await sh('systemctl', ['list-units','--type=service','--all','--no-legend','github-runner@*.service'], exec);
  const lines = out.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const items = [];
  for (const ln of lines){
    // Example columns: UNIT LOAD ACTIVE SUB DESCRIPTION
    // github-runner@p1-ci.service loaded active running GitHub Runner ...
    const m = ln.match(/^(github-runner@([^\s]+)\.service)\s+\S+\s+(\S+)/);
    if (!m) continue;
    const unitName = m[1];
    const active = m[3];
    // name format: <project>-<lane>
    const namePart = unitName.replace(/^github-runner@/,'').replace(/\.service$/,'');
    const dash = namePart.lastIndexOf('-');
    const projectId = namePart.slice(0, dash);
    const lane = namePart.slice(dash+1);
    items.push({ name: `${projectId}-${lane}`, projectId, lane, state: active, lastSeenEpochS: now });
  }
  return items;
}
