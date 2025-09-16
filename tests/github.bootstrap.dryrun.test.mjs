// tests/github.bootstrap.dryrun.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapRepoCI } from '../lib/github/bootstrap.mjs';

function fakeGh(){
  const calls = [];
  return {
    calls,
    async ensureBranch(owner, repo, head, base){ calls.push(['ensureBranch', owner, repo, head, base]); },
    async getFile(owner, repo, path, branch){ calls.push(['getFile', owner, repo, path, branch]); throw Object.assign(new Error('not found'), { status:404 }); },
    async putFile(owner, repo, path, branch, content, sha){ calls.push(['putFile', owner, repo, path, branch, content.length, sha||null]); return { content:{ path } }; },
    async openPR(owner, repo, head, base, title, body){ calls.push(['openPR', owner, repo, head, base, title]); return { number: 101 }; },
  };
}

test('bootstrap: dry-run still opens PR with deterministic branch and body', async () => {
  const gh = fakeGh();
  const tokenFn = async () => 'tkn';
  const ghFactory = async () => gh;
  const res = await bootstrapRepoCI({
    projectId: 'projX',
    owner: 'o',
    repo: 'r',
    lane: 'ci',
    base: 'main',
    tokenFn,
    ghFactory,
    dryRun: true,
  });
  assert.equal(res.ok, true);
  assert.equal(res.branch, 'vibe/bootstrap-ci/projX/ci');
  // putFile not called due to dryRun
  assert.equal(gh.calls.filter(c => c[0]==='putFile').length, 0);
  // openPR called
  assert.equal(gh.calls.filter(c => c[0]==='openPR').length, 1);
});
