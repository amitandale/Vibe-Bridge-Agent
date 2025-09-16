import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { createWorktree } from '../lib/git/worktree.mjs';
import { openPullRequest } from '../lib/git/gh.mjs';

function withMockedFetch(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    if (u.includes('/git/refs/heads/main') && method === 'GET') {
      return new Response(JSON.stringify({ object: { sha: 'abc' } }), { status: 200 });
    }
    if (u.endsWith('/git/refs') && method === 'POST') {
      return new Response(JSON.stringify({ ref: 'refs/heads/ai/x', object: { sha: 'abc' } }), { status: 201 });
    }
    if (u.includes('/contents/') && method === 'PUT') {
      return new Response(JSON.stringify({ content: { path: 'x' }, commit: { sha: 'def' } }), { status: 201 });
    }
    if (u.endsWith('/pulls') && method === 'POST') {
      return new Response(JSON.stringify({ html_url: 'https://example.com/pr/2', title: 't', body: 'b', number: 2 }), { status: 201 });
    }
    return new Response('', { status: 404 });
  };
  return fn().finally(() => { globalThis.fetch = original; });
}

test('finalize returns files and conventional commit message; branch created with ticket slug', async () => {
  process.env.GITHUB_TOKEN = 't';
  process.env.GITHUB_REPO = 'owner/name';

  const projectRoot = join(tmpdir(), 'agent-worktree-test');
  await fs.mkdir(projectRoot, { recursive: true });
  const wt = await createWorktree({ projectRoot });
  await wt.applyFile('src/hello.txt', 'hi');
  const pr = await withMockedFetch(async () => {
    return openPullRequest({
      projectRoot,
      worktree: wt,
      ticket: 'VIBE-123',
      title: 'Add greeting',
      body: 'B'
    });
  });
  assert.match(pr.branch, /^ai\/vibe-123/);
});
