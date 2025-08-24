import test from 'node:test';
import assert from 'node:assert/strict';
import { openPullRequest } from '../lib/git/gh.mjs';

function withMockedFetch(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    if (u.includes('/git/refs/heads/') && !process.env.GITHUB_TOKEN) {
      return new Response('', { status: 401 });
    }
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
      return new Response(JSON.stringify({ html_url: 'https://example.com/pr/1', title: 't', body: 'b', number: 1 }), { status: 201 });
    }
    return new Response('', { status: 404 });
  };
  return fn().finally(() => { globalThis.fetch = original; });
}

test('maps 401 to PROVIDER_UNAUTHORIZED', async () => {
  delete process.env.GITHUB_TOKEN;
  process.env.GITHUB_REPO = 'owner/name';
  await assert.rejects(() => withMockedFetch(() => openPullRequest({
    projectRoot: process.cwd(),
    worktree: { finalize: async () => ({ files: [{ path:'a.txt', content:'x'}], commitMessage:'m' }) },
    ticket: 'X-1',
    title: 'Hello',
    body: 'B'
  })), /PROVIDER_UNAUTHORIZED/);
});

test('success path returns PR object', async () => {
  process.env.GITHUB_TOKEN = 't';
  process.env.GITHUB_REPO = 'owner/name';
  await withMockedFetch(async () => {
    const pr = await openPullRequest({
      projectRoot: process.cwd(),
      worktree: { finalize: async () => ({ files: [{ path:'a.txt', content:'x'}], commitMessage:'m' }) },
      ticket: 'X-2',
      title: 'Hello',
      body: 'B'
    });
    assert.equal(typeof pr.url, 'string');
    assert.match(pr.branch, /^ai\//);
  });
});
