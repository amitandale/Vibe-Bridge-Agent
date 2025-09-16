import test from 'node:test';
import assert from 'node:assert/strict';
import { __setExecForTests, readProjectConfig } from '../lib/config/project.mjs';
import { GET as checkRoute } from '../app/api/llm/config/check/route.mjs';

test('check route: happy path JSON shape', async () => {
  process.env.CLAUDE_API_KEY = 'sk-test';
  process.env.CLAUDE_CODE_BIN = '/usr/local/bin/claude';
  process.env.DEFAULT_ROSTER = 'node,react,sql';

  // mock exec to simulate CLI found + version
  __setExecForTests(async () => ({ stdout: 'claude-code 0.9.1\n' }));

  const res = await checkRoute(new Request('http://local/api/llm/config/check'));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(j.claude.tokenPresent, true);
  assert.equal(j.claude.cliFound, true);
  assert.equal(j.claude.probe.ok, true);
  assert.match(j.claude.probe.detail, /0\.9\.1/);
  assert.deepEqual(j.roster, ['node','react','sql']);
});

test('check route: missing token and missing CLI reflected, never echo secret', async () => {
  delete process.env.CLAUDE_API_KEY;
  process.env.CLAUDE_CODE_BIN = '/not/found/claude';
  delete process.env.DEFAULT_ROSTER;

  __setExecForTests(async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; });

  const res = await checkRoute(new Request('http://local/api/llm/config/check'));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, false);
  assert.equal(j.claude.tokenPresent, false);
  assert.equal(j.claude.cliFound, false);
  assert.equal(j.claude.probe.ok, false);
  assert.match(j.claude.probe.detail, /not found|CLI not found/i);
  assert.deepEqual(j.roster, []);
});
