// lib/workspace/fs.mjs
// Filesystem layout, permissions, and disk checks. Pure with adapters for testability.

/** Return desired workspace paths and modes for a project */
export function desiredLayout(projectId){
  const base = `/home/devops/projects/${projectId}`;
  return {
    base,
    lanes: ['ci','staging','prod'].map(l => ({
      lane: l,
      dir: `${base}/${l}`,
      files: [
        { path: `${base}/${l}/docker-compose.yml`, mode: 0o640 },
        { path: `${base}/${l}/.env`, mode: 0o640 },
      ],
      workDir: { path: `${base}/${l}/_work`, mode: 0o700 }
    }))
  };
}

/** Check directory exists or can be created with safe perms.
 * adapter.fs API expected:
 *  - exists(path) -> bool
 *  - mkdir(path, mode)
 *  - chmod(path, mode)
 *  - stat(path) -> { mode, uid, gid }
 *  - statvfs(path) -> { bavail, frsize }  (Linux semantics)
 */
export async function checkFs({ projectId }, adapter, opts={}){
  const CAP_DISK_MIN_GB = Number(process.env.CAP_DISK_MIN_GB || 10);
  const layout = desiredLayout(projectId);
  const fs = adapter.fs;
  // Ensure base and lanes directories with 0750; _work 0700
  const ensureDir = async (p, mode) => {
    if (!await fs.exists(p)){ await fs.mkdir(p, mode); }
    await fs.chmod(p, mode);
    const st = await fs.stat(p);
    const worldWritable = (st.mode & 0o002) !== 0;
    if (worldWritable) return { ok:false, code:'E_FS_PERMS', details:{ path:p, mode:st.mode }, hint:'Remove world-writable bit (o-w) and retry' };
    return { ok:true };
  };
  // base
  let r = await ensureDir(layout.base, 0o750); if (!r.ok) return r;
  for (const lane of layout.lanes){
    r = await ensureDir(lane.dir, 0o750); if (!r.ok) return r;
    r = await ensureDir(lane.workDir.path, 0o700); if (!r.ok) return r;
  }
  // Disk space on base filesystem
  const vfs = await fs.statvfs(layout.base);
  const availGiB = (vfs.bavail * vfs.frsize) / (1024**3);
  if (availGiB < CAP_DISK_MIN_GB){
    return { ok:false, code:'E_DISK_LOW', details:{ available_gb: Number(availGiB.toFixed(2)), required_gb: CAP_DISK_MIN_GB }, hint:`Free space below ${CAP_DISK_MIN_GB} GiB` };
  }
  return { ok:true, layout };
}
