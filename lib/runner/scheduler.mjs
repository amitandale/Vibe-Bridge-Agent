// lib/runner/scheduler.mjs
// Periodic reconcile wrapper with retry-state updates and optional health export.
import { reconcileOnce } from './reconcile.mjs';

export async function tickOnce({ projectId, lane, nowEpochS = Math.floor(Date.now()/1000) }, adapter){
  // adapter must supply: listLocal, listRemote, getRetryState, setRetryState, pruneRetryState
  // optional: register, restart, postHealth
  const out = await reconcileOnce({ projectId, lane, nowEpochS }, adapter);
  const results = Array.isArray(out) ? out : (Array.isArray(out?.results) ? out.results : []);
  // Fallback: if no actions include 'register', try to register when local+remote missing
  const wantName = `${projectId}-${lane}`;
  const hasRegister = results.some(r => r?.action?.type === 'register');
  if (!hasRegister && adapter && adapter.register){
    const local = await adapter.listLocal?.() || [];
    const remote = await adapter.listRemote?.({}) || [];
    const localHas = local.some(x => x?.name === wantName);
    const remoteHas = remote.some(x => x?.name === wantName || (x?.labels||[]).includes(wantName));
    if (!localHas && !remoteHas){
      await adapter.register({ projectId, lane, name: wantName });
      results.push({ ok:true, action:{ type:'register', projectId, lane, name: wantName } });
    }
  }
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


// ---- BA-21b additions: periodic scheduler + metrics ----

const _metrics = {
  ticks: 0,
  actions: 0,
  successes: 0,
  failures: 0
};

/**
 * startScheduler
 * items: [{ projectId, lane }]
 * opts: { intervalMs=30000, jitterMs=5000, concurrency=2, now: ()=>Date.now() }
 * adapter: supplies listLocal, listRemote, register, restart, get/set/prune retry, postHealth (optional)
 * returns: { stop: ()=>Promise<void> }
 */
export function startScheduler(items, adapter, opts = {}){
  const intervalMs = opts.intervalMs ?? 30000;
  const jitterMs   = opts.jitterMs   ?? 5000;
  const maxConc    = opts.concurrency ?? 2;
  const nowFn      = opts.now ?? (()=>Date.now());

  let stopped = false;
  let inFlight = 0;
  const timers = new Set();

  async function runOne(it){
    if (stopped) return;
    if (inFlight >= maxConc) return;
    inFlight++;
    try {
      _metrics.ticks++;
      const res = await tickOnce({ projectId: it.projectId, lane: it.lane, nowEpochS: Math.floor(nowFn()/1000) }, adapter);
      const arr = Array.isArray(res) ? res : (Array.isArray(res?.results) ? res.results : []);
      _metrics.actions += arr.length;
      for (const r of arr){
        if (r?.ok) _metrics.successes++; else _metrics.failures++;
      }
    } catch {
      _metrics.failures++;
    } finally {
      inFlight--;
    }
  }

  function schedule(it){
    if (stopped) return;
    const jitter = Math.floor(Math.random()*jitterMs);
    const t = setTimeout(async function loop(){
      if (stopped) return;
      await runOne(it);
      if (stopped) return;
      const t2 = setTimeout(loop, intervalMs + Math.floor(Math.random()*jitterMs));
      timers.add(t2);
    }, intervalMs + jitter);
    timers.add(t);
  }

  for (const it of items){
    schedule(it);
  }

  return {
    async stop(){
      stopped = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      // wait for in-flight to drain
      const limitMs = 2000;
      const start = Date.now();
      while (inFlight > 0 && (Date.now()-start) < limitMs){
        await new Promise(r=>setTimeout(r, 10));
      }
    }
  };
}

/** Export metrics snapshot for scraping */
export function getMetrics(){
  return { ..._metrics };
}

// Enhance tickOnce with onSuccess/onFailure hooks without altering existing behavior
const _orig_tickOnce = tickOnce;
export async function tickOnceWithHooks(args, adapter){
  const results = await _orig_tickOnce(args, adapter);
  const arr = Array.isArray(results) ? results : (Array.isArray(results?.results) ? results.results : []);
  for (const r of arr){
    try {
      if (r?.ok) await adapter.onSuccess?.(r.action);
      else await adapter.onFailure?.(r.action);
    } catch {}
  }
  return results;
}
