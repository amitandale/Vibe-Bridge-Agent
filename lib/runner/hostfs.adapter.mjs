// lib/runner/hostfs.adapter.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function mkdirp(p, mode=0o755){
  await fs.mkdir(p, { recursive: true, mode });
  await fs.chmod(p, mode);
}
export async function writeFile(p, content, mode=0o644){
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content);
  await fs.chmod(p, mode);
}
export async function exists(p){
  try { await fs.access(p); return true; } catch { return false; }
}
export async function chownr(p, uid, gid){
  // In CI, we skip chown to avoid EPERM. Real runtime can map devops uid/gid.
  if (process.env.CI) return { ok:true, dryRun:true };
  try {
    await fs.chown(p, uid, gid);
    return { ok:true };
  } catch {
    return { ok:false, hint:'chown failed (non-root?)' };
  }
}
export async function chmod(p, mode){ await fs.chmod(p, mode); }
