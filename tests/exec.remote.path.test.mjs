// tests/exec.remote.path.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const execModUrl = new URL('../lib/exec/executor.mjs', import.meta.url).href;

test('executor picks remote path when EXEC_MODE=remote and normalizes output', async () => {
  process.env.EXEC_MODE = 'remote';
  let called = 0;
  globalThis.__opendevinClient = {
    async exec({ cwd, shell, commands, env, timeoutMs, idempotencyKey }) {
      called++;
      return { stdout: 'ok', stderr: '', exitCode: 0, durationMs: 7 };
    }
  };

  const mod = await import(execModUrl);
  const res = await mod.pickExecute({ plan: { exec: { cwd:'/w', shell:'bash', commands:['echo ok'], env:{ CI:'true' }, timeoutMs: 1000 } } });
  assert.equal(res.ok, true);
  assert.equal(res.exitCode, 0);
  assert.equal(res.stdout, 'ok');
  assert.equal(typeof res.durationMs, 'number');
  assert.equal(called, 1);

  delete process.env.EXEC_MODE;
  delete globalThis.__opendevinClient;
});

test('executor falls back to local when EXEC_MODE=local', async () => {
  process.env.EXEC_MODE = 'local';
  const mod = await import(execModUrl);
  const res = await mod.pickExecute({ plan: {} });
  assert.equal(typeof res, 'object');
  delete process.env.EXEC_MODE;
});
