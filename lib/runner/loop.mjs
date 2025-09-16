// lib/runner/loop.mjs
import { reconcileOnce, executePlan, runnerName } from './reconcile.mjs';
import * as retryStore from './retryState.mjs';

/** One tick. Adapter must provide listLocal, listRemote, restart, register. */
export async function tick({ projectId, lane, nowEpochS }, adapter){
  const plan = await reconcileOnce({ projectId, lane, nowEpochS }, {
    listLocal: adapter.listLocal,
    listRemote: adapter.listRemote,
    getRetryState: async (name) => retryStore.get(name),
  });

  // Wrap register to update retry state
  const results = [];
  for (const a of plan.actions){
    if (a.type === 'register'){
      const name = a.name;
      const prev = await retryStore.get(name);
      await retryStore.set(name, { lastAttemptEpochS: nowEpochS, failures: prev.failures + 1 });
      if (adapter.register){
        await adapter.register({ projectId: a.projectId, lane: a.lane, name });
        // on success, reset failures
        await retryStore.set(name, { lastAttemptEpochS: nowEpochS, failures: 0 });
      }
      results.push({ ok:true, action: a });
    } else if (a.type === 'restart' && adapter.restart){
      await adapter.restart(a.name);
      results.push({ ok:true, action: a });
    } else {
      results.push({ ok:true, action: a });
    }
  }
  return { ok:true, actions: plan.actions };
}
