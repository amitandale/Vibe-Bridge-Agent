import test from 'node:test';
import assert from 'node:assert/strict';
import { __setRunClaudeSessionForTests, runClaudeSession } from '../lib/ai/claude/cli-bridge.mjs';

test('Claude bridge: test stub returns structured result', async () => {
  __setRunClaudeSessionForTests(async ({ system, messages, tools }) => {
    return {
      changes: [{ path: 'hello.txt', content: 'hi' }],
      pr: { title: 'hello', body: 'world' }
    };
  });
  const res = await runClaudeSession({ system:'s', messages:[{role:'user', content:'x'}], tools:['ls'] });
  assert.equal(Array.isArray(res.changes), true);
  assert.equal(typeof res.pr.title, 'string');
});
