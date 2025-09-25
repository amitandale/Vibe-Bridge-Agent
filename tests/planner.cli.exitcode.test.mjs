import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('planner CLI dry-run exits non-zero when essentials missing', async (t) => {
  const tmp = join(tmpdir(), 'empty.diff');
  await writeFile(tmp, '');
  const p = spawn(process.execPath, ['scripts/planner.mjs', 'dry-run', '--pr', '1', '--commit', 'deadbee', '--mode', 'PR', '--diff', tmp], { stdio: 'ignore' });
  const code = await new Promise(res => p.on('close', res));
  assert.notEqual(code, 0);
});
