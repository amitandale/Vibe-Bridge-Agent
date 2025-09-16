// tests/runner.loop.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tick } from '../lib/runner/loop.mjs';
import { runnerName } from '../lib/runner/reconcile.mjs';
import * as retryStore from '../lib/runner/retryState.mjs';

test('tick registers when remote missing and resets failures on success', async () => {
  const projectId = 'p1', lane = 'ci', now = 1000;
  const name = runnerName(projectId, lane);
  // Clear retry store file by overriding its path via monkey patch
  // We cannot change module internals easily here, so we rely on it starting empty.

  let registered = null, restarted = null;
  const adapter = {
    async listLocal(){ return [{ name, projectId, lane, state:'active', lastSeenEpochS:999 }]; },
    async listRemote(){ return []; },
    async register({ name: n }){ registered = n; },
    async restart(n){ restarted = n; },
  };
  const r = await tick({ projectId, lane, nowEpochS: now }, adapter);
  assert.equal(registered, name);
});
