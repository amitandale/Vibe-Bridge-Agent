import test from 'node:test';
import assert from 'node:assert/strict';
import { setKey, getKey, rotate } from '../lib/keystore/local.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test('keystore set/get/rotate', async () => {
  const tmp = path.join(process.cwd(), '.tmp-home-keys');
  process.env.HOME = tmp;
  process.env.VIBE_KEYSTORE_PASS = 'test-pass';
  await mkdir(path.join(tmp, '.vibe'), { recursive: true });
  await setKey('perplexity', 'pplx-key', 'https://api.perplexity.ai');
  const rec = await getKey('perplexity');
  assert.equal(rec.apiKey, 'pplx-key');
  assert.equal(rec.baseUrl, 'https://api.perplexity.ai');
  // rotate with different passphrase
  process.env.VIBE_KEYSTORE_PASS = 'new-pass';
  await rotate('test-pass','new-pass');
  const rec2 = await getKey('perplexity');
  assert.equal(rec2.apiKey, 'pplx-key');
});
