// tests/orchestrator.sequence.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeOrchestrator, STEPS } from '../lib/orchestrator.mjs';

test('orchestrator: run → status/advance sequence and idempotency', async () => {
  const events = { appended: [], append: (_projectId, e) => events.appended.push(e) };
  const orch = makeOrchestrator({ providers: {}, events, now: () => 123 });
  const { ok, jobId, steps } = await orch.run({ project: { id: 'p1' } });
  assert.equal(ok, true);
  assert.ok(jobId);
  assert.deepEqual(steps, STEPS);

  let st = await orch.status({ jobId });
  assert.equal(st.ok, true);
  assert.equal(st.done, false);
  assert.equal(st.step, 'VALIDATING_TOKENS');

  // advance through all steps
  for (let i = 0; i < STEPS.length; i++) {
    const adv = await orch.advance({ jobId, step: STEPS[i] });
    assert.equal(adv.ok, true);
  }
  st = await orch.status({ jobId });
  assert.equal(st.done, true);
  assert.equal(st.step, 'VERIFYING');
  assert.match(st.previewUrl, /^https:\/\/preview\.example\.test\/job_/);

  // idempotent: repeated advance after done should not throw, stays done
  const adv2 = await orch.advance({ jobId, step: 'VERIFYING' });
  assert.equal(adv2.ok, true);
  const st2 = await orch.status({ jobId });
  assert.equal(st2.done, true);
});

