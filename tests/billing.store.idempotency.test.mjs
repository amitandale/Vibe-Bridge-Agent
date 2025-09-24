import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertBudget, loadBudgets, recordUsage, listUsage } from '../lib/billing/store.mjs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

test('budgets upsert round-trip', async () => {
  const tmp = path.join(process.cwd(), '.tmp-home-store-1');
  process.env.HOME = tmp;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(path.join(tmp, '.vibe', 'billing'), { recursive: true });
  const b = await upsertBudget({ scope:'project', scopeId:'p1', hardUsd:10, softUsd:5, period:'month' });
  assert.equal(b.id, 'project:p1:month');
  const list = await loadBudgets();
  assert.equal(list.length, 1);
  assert.equal(list[0].hardUsd, 10);
});

test('usage idempotent by callId', async () => {
  const tmp = path.join(process.cwd(), '.tmp-home-store-2');
  process.env.HOME = tmp;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(path.join(tmp, '.vibe', 'billing'), { recursive: true });
  const ev = { callId:'abc', provider:'perplexity', model:'pplx-7b-chat', inputTokens:100, outputTokens:20, costUsd:0.05, prId:'1' };
  const r1 = await recordUsage(ev);
  const r2 = await recordUsage(ev);
  assert.equal(r1.inserted, true);
  assert.equal(r2.inserted, false);
  const list = await listUsage({ prId:'1', limit:10 });
  assert.equal(list.length, 1);
});
