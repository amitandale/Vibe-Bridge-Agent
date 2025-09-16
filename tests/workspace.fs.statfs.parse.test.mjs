// tests/workspace.fs.statfs.parse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatFS } from '../lib/workspace/fs.host.mjs';

test('parseStatFS parses both concise and human stat -f outputs', () => {
  const concise = '4096 1000000 250000';
  const a = parseStatFS(concise);
  assert.equal(String(a.blockSize), '4096');
  assert.equal(String(a.blocksTotal), '1000000');
  assert.equal(String(a.blocksFree), '250000');
  const human = `Block size: 4096
Blocks: Total: 6108038   Free: 1302706   Available: 864320
`;
  const b = parseStatFS(human);
  assert.equal(String(b.blockSize), '4096');
  assert.equal(String(b.blocksFree), '1302706');
});
