// lib/runner/scheduler.mjs
// Periodic reconcile wrapper with retry-state updates and optional health export.
import { reconcileOnce } from './reconcile.mjs';

export async function tickOnce({ projectId, lane, nowEpochS = Math.floor(Date.now()/1000) }, adapter){
  // adapter must supply: listLocal, listRemote, getRetryState, setRetryState, pruneRetryState
  // optional: register, restart, postHealth
  const out = await reconcileOnce({ projectId, lane, nowEpochS }, adapter);
  const results = Array.isArray(out) ? out : (Array.isArray(out?.results) ? out.results : []);
  // Update retry state counters based on executed actions
  if (results.length === 0){
    // Fallback: ensure default name state reset when reconcileOnce did not return per-action results
    await adapter.setRetryState?.(`${projectId}-${lane}`, { failures: 0, lastAttemptEpochS: nowEpochS });
  }
  for (const r of results){
    const a = r.action;
    const name = a?.name || `${projectId}-${lane}`;
    if (r.ok){
      await adapter.setRetryState?.(name, { failures: 0, lastAttemptEpochS: nowEpochS });
    } else {
      const cur = await adapter.getRetryState?.(name) || { failures: 0 };
      await adapter.setRetryState?.(name, { failures: (cur.failures|0)+1, lastAttemptEpochS: nowEpochS });
    }
  }
  // Optional health export
  if (adapter.postHealth){
    try {
      const local = await adapter.listLocal?.() || [];
      const remote = await adapter.listRemote?.({}) || [];
      await adapter.postHealth({ projectId, lane, nowEpochS, local, remote });
    } catch {}
  }
  // Prune old retry entries
  await adapter.pruneRetryState?.({});
  return results;
}
