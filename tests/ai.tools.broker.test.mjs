import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { createToolBroker } from '../lib/ai/tools/broker.mjs';

test('ToolBroker: jail and read/ls/grep basics', async () => {
  const root = join(tmpdir(), 'agent-broker-test');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(join(root, 'a.txt'), 'hello world');
  await fs.mkdir(join(root, 'sub'), { recursive: true });
  await fs.writeFile(join(root, 'sub', 'b.txt'), 'greetings');

  const tb = createToolBroker({ root });
  const ls = await tb.ls('.');
  assert.ok(ls.find(x => x.name === 'a.txt'));
  const txt = await tb.read('a.txt');
  assert.equal(txt, 'hello world');
  const hits = await tb.grep('greet', '.');
  assert.ok(hits.find(h => h.file.endsWith('sub/b.txt')));
});

test('ToolBroker: path escape is blocked', async () => {
  const root = join(tmpdir(), 'agent-broker-test2');
  await fs.mkdir(root, { recursive: true });
  const tb = createToolBroker({ root });
  await assert.rejects(() => tb.read('../etc/passwd'), /PATH_ESCAPE/);
});
