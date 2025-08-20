
import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureBranch, getFile, putFile, deleteFile, openPR } from '../lib/github.testshim.mjs';

function fakeOctokit(seq=[]){
  let i=0;
  return {
    async request(route, params){
      const step = seq[i++] || {};
      if (step.throw) {
        const e = new Error(step.throw.message||'err'); e.status = step.throw.status||500; throw e;
      }
      if (route.startsWith('GET /repos/') && route.includes('/git/ref/')) {
        // ref request
        if (params.ref.startsWith('heads/')) {
          // create a synthetic sha
          return { data: { object: { sha: 'base-sha-123' } } };
        }
      }
      if (route.startsWith('GET /repos/') && route.includes('/contents/')) {
        if (step.data) return { data: step.data };
        const e = new Error('not found'); e.status = 404; throw e;
      }
      if (route.startsWith('PUT /repos/') && route.includes('/contents/')) {
        return { data: { ok:true, path: params.path, branch: params.branch } };
      }
      if (route.startsWith('DELETE /repos/') && route.includes('/contents/')) {
        return { data: { ok:true } };
      }
      if (route.startsWith('POST /repos/') && route.includes('/git/refs')) {
        return { data: { ok:true } };
      }
      if (route.startsWith('POST /repos/') && route.includes('/pulls')) {
        return { data: { number: 42, html_url: 'http://pr' } };
      }
      return { data: {} };
    }
  };
}

test('ensureBranch creates branch when missing', async () => {
  const ok = fakeOctokit([
    { },           // GET base ref
    { throw: { status: 404 } }, // GET branch ref (missing)
    { },           // POST create ref
  ]);
  await ensureBranch(ok, 'o','r','main','feature/x');
});

test('getFile returns exists=false on 404', async () => {
  const ok = fakeOctokit([]);
  const res = await getFile(ok, 'o','r','README.md','main');
  assert.equal(res.exists, false);
});

test('getFile decodes base64 when present', async () => {
  const content = Buffer.from('hello','utf8').toString('base64');
  const ok = fakeOctokit([{ data: { content, sha: 'abc' } }]);
  const res = await getFile(ok, 'o','r','README.md','main');
  assert.equal(res.exists, true);
  assert.equal(res.text, 'hello');
  assert.equal(res.sha, 'abc');
});

test('putFile sends content and branch', async () => {
  const ok = fakeOctokit([]);
  const res = await putFile(ok, 'o','r','README.md','feature/x','new content', null);
  assert.equal(res.path, 'README.md');
  assert.equal(res.branch, 'feature/x');
});

test('deleteFile issues delete', async () => {
  const ok = fakeOctokit([]);
  await deleteFile(ok, 'o','r','README.md','feature/x','sha123');
});

test('openPR returns PR data', async () => {
  const ok = fakeOctokit([]);
  const pr = await openPR(ok, 'o','r','feature/x','main','t','b');
  assert.equal(pr.number, 42);
});
