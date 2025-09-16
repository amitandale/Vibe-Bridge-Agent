// node:test style, fast and deterministic
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../../lib/exec/executor.mjs';

test('executor uses injected retriever and keeps plan stable', async () => {
  const calls = [];
  const fakeRetrieve = async (ctx, q) => {
    calls.push({ ctx, q });
    return [{ id: 'stub', q, ctx: ctx && ctx.runId ? ctx.runId : null }];
  };

  const plan = {
    query: 'add-retries-to-deploy',
    steps: [{ name: 'scan', desc: 'scan repo for deploy scripts' }]
  };
  const ctx = { runId: 't-001' };

  const out = await execute({ plan, ctx, retrieve: fakeRetrieve });

  assert.equal(out.ok, true);
  assert.equal(out.samePlan, true, 'executor must not mutate plan');
  assert.equal(calls.length, 1, 'retriever must be called exactly once');
  assert.equal(calls[0].q, 'add-retries-to-deploy', 'query derived from plan.query');
  assert.deepEqual(out.retrieved, [{ id: 'stub', q: 'add-retries-to-deploy', ctx: 't-001' }]);
});

test('executor tolerates retriever failure and still returns ok', async () => {
  const badRetrieve = async () => { throw new Error('boom'); };
  const out = await execute({ plan: { goal: 'noop' }, retrieve: badRetrieve });
  assert.equal(out.ok, true);
  assert.equal(Array.isArray(out.retrieved), true);
  assert.equal(out.retrieved.length, 0);
});
