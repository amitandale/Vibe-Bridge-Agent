// lib/runner/reconcile.mjs
// Inventory reconciliation and auto-heal planning for GitHub self-hosted runners.
import { classifyService, shouldRetry } from './health.mjs';

/** Deterministic runner name for a project/lane pair */
export function runnerName(projectId, lane){ return `${projectId}-${lane}`; }

/** Compute reconcile plan without side effects.
 * adapter methods used (all optional for planning):
 *  - listLocal() -> [{ name, projectId, lane, state, lastSeenEpochS }]
 *  - listRemote() -> [{ name, projectId, lane, status }]
 *  - getRetryState(name) -> { lastAttemptEpochS, failures }
 */
export async function reconcileOnce({ projectId, lane, nowEpochS }, adapter){
  const wantName = runnerName(projectId, lane);
  const local = (await adapter.listLocal?.()) || [];
  const remote = (await adapter.listRemote?.()) || [];

  const loc = local.find(x => x.name === wantName);
  const rem = remote.find(x => x.name === wantName);

  const actions = [];
  const snap = { local, remote, wantName };

  // Health check on local service
  if (loc){
    const health = classifyService({ state: loc.state, lastSeenEpochS: loc.lastSeenEpochS||0, nowEpochS });
    if (health === 'unhealthy' || health === 'stale'){
      actions.push({ type: 'restart', name: wantName, reason: health });
    }
  }

  // Registration check on remote inventory
  if (!rem){
    // respect backoff
    const rs = adapter.getRetryState ? await adapter.getRetryState(wantName) : { lastAttemptEpochS: 0, failures: 0 };
    if (shouldRetry({ lastAttemptEpochS: rs.lastAttemptEpochS||0, failures: rs.failures||0, nowEpochS })){
      actions.push({ type: 'register', projectId, lane, name: wantName });
    } else {
      actions.push({ type: 'noop', name: wantName, reason: 'backoff' });
    }
  }

  return { actions, snapshot: snap };
}

/** Execute a plan using imperative adapter calls. Split for testability. */
export async function executePlan(plan, adapter){
  const results = [];
  for (const a of plan.actions){
    if (a.type === 'restart' && adapter.restart){
      await adapter.restart(a.name);
      results.push({ ok: true, action: a });
    } else if (a.type === 'register' && adapter.register){
      await adapter.register({ projectId: a.projectId, lane: a.lane, name: a.name });
      results.push({ ok: true, action: a });
    } else {
      results.push({ ok: true, action: a });
    }
  }
  return results;
}
