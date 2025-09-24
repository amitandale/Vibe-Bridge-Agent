import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

test('checkBudget: denies when hard cap would be exceeded', async () => {
  const tmp = path.join(process.cwd(), '.tmp-home-enforce-1');
  process.env.HOME = tmp;
  await mkdir(path.join(tmp, '.vibe', 'billing'), { recursive: true });
  // Set a tiny budget
  await writeFile(path.join(tmp, '.vibe', 'billing', 'budgets.json'),
    JSON.stringify([{ id:'project:demo:once', scope:'project', scopeId:'demo', hardUsd:0.0001, softUsd:0.00005, period:'once', active:true }], null, 2));
  const ef = await import('../lib/billing/enforce.mjs');
  const est = { inputTokens: 1000, outputTokens: 0 };
  const r = await ef.checkBudget({ projectId:'demo', provider:'perplexity', model:'pplx-7b-chat', estimate: est });
  assert.equal(r.allowed, false);
  assert.equal(r.hardExceeded, true);
});

test('recordUsage: writes event and is idempotent', async () => {
  const tmp = path.join(process.cwd(), '.tmp-home-enforce-2');
  process.env.HOME = tmp;
  await mkdir(path.join(tmp, '.vibe', 'billing'), { recursive: true });
  const ef = await import('../lib/billing/enforce.mjs');
  const ev = { callId:'call-1', provider:'perplexity', model:'pplx-7b-chat', inputTokens:10, outputTokens:0, costUsd:0.001, projectId:'demo' };
  const r1 = await ef.recordUsage(ev);
  const r2 = await ef.recordUsage(ev);
  assert.equal(r1.inserted, true);
  assert.equal(r2.inserted, false);
});
