// lib/runner/systemd.adapter.mjs
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** Write a unit file to disk */
export async function writeUnit({ path, content }){
  await fs.mkdir(path.split('/').slice(0,-1).join('/'), { recursive: true });
  await fs.writeFile(path, content, { mode: 0o644 });
}

/** Run 'systemctl daemon-reload' */
export async function daemonReload(){
  if (process.env.CI) return { ok:true, dryRun:true };
  const r = spawnSync('systemctl', ['daemon-reload'], { stdio: 'ignore' });
  if (r.status !== 0) throw new Error('SYSTEMD_RELOAD_FAILED');
  return { ok:true };
}

/** Enable and start a unit now */
export async function enableNow(unitName){
  if (process.env.CI) return { ok:true, dryRun:true };
  const a = spawnSync('systemctl', ['enable', '--now', unitName], { stdio: 'ignore' });
  if (a.status !== 0) throw new Error('SYSTEMD_ENABLE_FAILED');
  return { ok:true };
}
