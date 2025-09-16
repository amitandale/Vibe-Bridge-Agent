import path from 'node:path';
// lib/runner/bundle.mjs
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';

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

import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import os from 'node:os';

export async function installBundleFromUrl({ url, destDir, fsAdapter }){
  const tmp = path.join(os.tmpdir(), `runner-${Date.now()}.tar.gz`);
  await download(url, tmp);
  try {
    return await installBundleFromTarball({ tarPath: tmp, destDir, fsAdapter });
  } finally {
    try { await fs.unlink(tmp); } catch {}
  }
}

function download(url, outPath){
  const client = url.startsWith('https:') ? httpsRequest : httpRequest;
  return new Promise((resolve,reject)=>{
    const req = client(url, res=>{
      if (res.statusCode && res.statusCode>=300 && res.statusCode<400 && res.headers.location){
        // simple redirect follow one hop
        const req2 = client(res.headers.location, res2=> pipeToFile(res2, outPath, resolve, reject));
        req2.on('error', reject); req2.end(); return;
      }
      if (res.statusCode !== 200){ reject(new Error(`HTTP ${res.statusCode}`)); return; }
      pipeToFile(res, outPath, resolve, reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function pipeToFile(res, outPath, resolve, reject){
  const out = createWriteStream(outPath);
  pipeline(res, out).then(()=>resolve(outPath)).catch(reject);
}
