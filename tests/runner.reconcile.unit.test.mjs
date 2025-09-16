// tests/runner.reconcile.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileOnce, executePlan, runnerName } from '../lib/runner/reconcile.mjs';

test('auto-heal restarts unhealthy local service', async () => {
  const projectId = 'p1', lane = 'ci', now = 1000;
  const name = runnerName(projectId, lane);
  const adapter = {
    async listLocal(){ return [{ name, projectId, lane, state: 'failed', lastSeenEpochS: 999 }]; },
    async listRemote(){ return [{ name, projectId, lane, status: 'online' }]; },
    async getRetryState(){ return { lastAttemptEpochS: 0, failures: 0 }; },
    async restart(n){ adapter._restarted = n; }
  };
  const plan = await reconcileOnce({ projectId, lane, nowEpochS: now }, adapter);
  assert.deepEqual(plan.actions.map(a => a.type), ['restart']);
  await executePlan(plan, adapter);
  assert.equal(adapter._restarted, name);
});

test('missing remote triggers re-register if not in backoff', async () => {
  const projectId = 'p1', lane = 'ci', now = 5000;
  const name = runnerName(projectId, lane);
  const adapter = {
    async listLocal(){ return [{ name, projectId, lane, state: 'active', lastSeenEpochS: 4999 }]; },
    async listRemote(){ return []; },
    async getRetryState(){ return { lastAttemptEpochS: 0, failures: 0 }; },
    async register({ name }){ adapter._registered = name; }
  };
  const plan = await reconcileOnce({ projectId, lane, nowEpochS: now }, adapter);
  assert.deepEqual(plan.actions.map(a => a.type), ['register']);
  await executePlan(plan, adapter);
  assert.equal(adapter._registered, name);
});

test('backoff suppresses re-register attempts', async () => {
  const projectId = 'p1', lane = 'ci', now = 1000;
  const adapter = {
    async listLocal(){ return []; },
    async listRemote(){ return []; },
    async getRetryState(){ return { lastAttemptEpochS: 995, failures: 2 }; }, // need 20s
  };
  const plan = await reconcileOnce({ projectId, lane, nowEpochS: now }, adapter);
  assert.deepEqual(plan.actions.map(a => a.type), ['noop']);
});
