import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from '../../lib/agents/teamLeader.mjs';

test('teamLeader.runPlan wires retrieve into executor', async () => {
  const calls = [];
  const fakeRetrieve = async (ctx, q) => { calls.push(q); return [{ id: 'x', q }]; };
  const plan = { query: 'upgrade-ci' };
  const ctx = { runId: 'TL-1' };
  const out = await runPlan(ctx, plan, { retrieve: fakeRetrieve });
  assert.equal(out.ok, true);
  assert.equal(out.samePlan, true);
  assert.equal(calls.length, 1);
});
