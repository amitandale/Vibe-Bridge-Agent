// tests/runner.scheduler.loop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tickOnce } from '../lib/runner/scheduler.mjs';

test('scheduler.tickOnce resets failures on success', async () => {
  const calls = [];
  const adapter = {
    async listLocal(){ return []; },
    async listRemote(){ return []; },
    async register({ projectId, lane, name }){ calls.push(['register',name]); },
    // reconcileOnce will call adapter.register when remote missing; it returns ok:true entries
    _state: {},
    async getRetryState(name){ return this._state[name] || { failures: 3, lastAttemptEpochS: 0 }; },
    async setRetryState(name, st){ this._state[name] = st; },
    async pruneRetryState(){ return { ok:true }; }
  };
  const res = await tickOnce({ projectId:'p1', lane:'ci' }, adapter);
  assert.ok(calls.find(x=>x[0]==='register'));
  const st = await adapter.getRetryState('p1-ci');
  assert.equal(st.failures, 0);
});
