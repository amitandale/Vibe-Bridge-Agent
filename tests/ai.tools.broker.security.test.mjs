import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { createToolBroker } from '../lib/ai/tools/broker.mjs';

test('ToolBroker: FILE_TOO_LARGE is enforced', async () => {
  const root = join(tmpdir(), 'agent-broker-big');
  await fs.mkdir(root, { recursive: true });
  const big = 'x'.repeat(600 * 1024);
  await fs.writeFile(join(root, 'big.txt'), big, 'utf8');
  const tb = createToolBroker({ root });
  await assert.rejects(() => tb.read('big.txt'), /FILE_TOO_LARGE/);
});

test('ToolBroker: bash allow-list enforced', async () => {
  const root = join(tmpdir(), 'agent-broker-bash');
  await fs.mkdir(root, { recursive: true });
  const tb = createToolBroker({ root });
  await assert.rejects(() => tb.bash('curl', ['-s', 'http://example.com']), /BASH_CMD_NOT_ALLOWED/);
});
