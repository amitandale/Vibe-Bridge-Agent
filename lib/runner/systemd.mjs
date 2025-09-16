// lib/runner/systemd.mjs
// Thin wrapper used by CLI; tests still use injected adapters.
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

export async function writeUnit({ sysDir, unitName, content }){
  await fs.mkdir(sysDir, { recursive: true, mode: 0o755 });
  const path = `${sysDir}/${unitName}`;
  await fs.writeFile(path, content, { mode: 0o644 });
  return path;
}

export async function daemonReload(){
  await sh(['systemctl','daemon-reload']);
}

export async function enableNow({ unitName }){
  await sh(['systemctl','enable','--now', unitName]);
}

export async function status({ unitName }){
  try {
    const out = await sh(['systemctl','is-active', unitName]);
    return out.trim();
  } catch {
    return 'inactive';
  }
}

function sh(argv){
  return new Promise((resolve,reject)=>{
    const p = spawn(argv[0], argv.slice(1), { stdio:['ignore','pipe','pipe'] });
    let out=''; let err='';
    p.stdout.on('data', d=> out+=d);
    p.stderr.on('data', d=> err+=d);
    p.on('close', (code)=> code===0 ? resolve(out) : reject(new Error(err||`exit ${code}`)));
  });
}
