// lib/workspace/ownership.mjs

/** Compute chmod/chown plan for runner directories.
 * Returns { ops: [{op:'chmod'|'chown', path, mode? , uid?, gid?}] }
 */
export function enforceOwnershipPlan({ root, user='devops', group='devops' }, inspect){
  const ops = [];
  const want = {
    [root]: 0o750,
    [root+'/_work']: 0o700,
    [root+'/env']: 0o750,
    [root+'/logs']: 0o750,
    [root+'/bin']: 0o750,
  };
  const uid = inspect?.uidOf?.(user) ?? 1000;
  const gid = inspect?.gidOf?.(group) ?? 1000;

  for (const [p, mode] of Object.entries(want)){
    const st = inspect?.statOf?.(p) || { mode: 0o777, uid: 0, gid: 0 };
    const curMode = st.mode & 0o777;
    if (curMode !== mode){
      ops.push({ op:'chmod', path:p, mode });
    }
    if (st.uid !== uid || st.gid !== gid){
      ops.push({ op:'chown', path:p, uid, gid });
    }
  }
  return { ops };
}

// Apply a computed plan using fsAdapter methods: chmod(path, mode) and chown(path, uid, gid)
export async function applyOwnershipPlan(fsAdapter, plan){
  for (const op of plan?.ops || []){
    if (op.op === 'chmod' && fsAdapter?.chmod) await fsAdapter.chmod(op.path, op.mode);
    if (op.op === 'chown' && fsAdapter?.chown) await fsAdapter.chown(op.path, op.uid, op.gid);
  }
  return { ok:true };
}
