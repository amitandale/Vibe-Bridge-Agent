// lib/runner/bundle.mjs
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Install runner bundle to destDir.
 * Supports bundlePath as directory (expects config.sh and runsvc.sh) or .tar.gz.
 */
export async function installBundle({ bundlePath, destDir }){
  await fs.mkdir(destDir, { recursive: true });
  if (!bundlePath) throw new Error('MISSING_BUNDLE');
  if (bundlePath.endsWith('.tar.gz') || bundlePath.endsWith('.tgz')){
    const r = spawnSync('tar', ['-xzf', bundlePath, '-C', destDir], { stdio: 'ignore' });
    if (r.status !== 0) throw new Error('BUNDLE_EXTRACT_FAILED');
  } else {
    // Copy directory contents
    const entries = await fs.readdir(bundlePath);
    for (const name of entries){
      const src = path.join(bundlePath, name);
      const dst = path.join(destDir, name);
      const st = await fs.stat(src);
      if (st.isDirectory()){
        await fs.mkdir(dst, { recursive: true });
      } else {
        await fs.copyFile(src, dst);
      }
    }
  }
  // Ensure scripts are executable if present
  for (const f of ['config.sh','runsvc.sh']){
    const p = path.join(destDir, f);
    try {
      await fs.chmod(p, 0o755);
    } catch {}
  }
  return { ok:true };
}
