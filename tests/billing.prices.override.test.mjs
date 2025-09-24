import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPrices, getPrice } from '../lib/billing/prices.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

test('prices: defaults present', async () => {
  const list = await loadPrices();
  assert.ok(list.length > 0);
  const p = await getPrice({ provider:'perplexity', model:'pplx-7b-chat' });
  assert.ok(p && p.inputPer1KUsd > 0);
});

test('prices: override takes precedence', async () => {
  // point HOME to a temp dir within test process
  const tmp = path.join(process.cwd(), '.tmp-home-prices');
  process.env.HOME = tmp;
  await mkdir(path.join(tmp, '.vibe', 'billing'), { recursive: true });
  await writeFile(path.join(tmp, '.vibe', 'billing', 'prices.json'),
    JSON.stringify([{ provider:'perplexity', model:'pplx-7b-chat', inputPer1KUsd:9.9, outputPer1KUsd:9.9 }], null, 2));
  const p = await getPrice({ provider:'perplexity', model:'pplx-7b-chat' });
  assert.equal(p.inputPer1KUsd, 9.9);
});
