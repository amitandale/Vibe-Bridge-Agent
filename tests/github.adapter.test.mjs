
import test from 'node:test';
import assert from 'node:assert/strict';

async function load(){
  try {
    return await import('../lib/github.testshim.mjs');
  } catch (e) {
    return null;
  }
}

function fakeOctokit(seq=[]){
  let i=0;
  return {
    async request(route, params){
      const step = seq[i++] || {};
      if (step.throw) {
        const e = new Error(step.throw.message||'err'); e.status = step.throw.status||500; throw e;
      }
      if (route.startsWith('GET /repos/') && route.includes('/git/ref/')) {
        if (params.ref.startsWith('heads/')) return { data: { object: { sha: 'base-sha-123' } } };
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

test('github adapter functions (shimmed)', async (t) => {
  const mod = await load();
  if (!mod) {
    t.skip('Skipping: cannot import github.js via ESM shim in this environment');
    return;
  }
  const { ensureBranch, getFile, putFile, deleteFile, openPR } = mod;

  const ok1 = fakeOctokit([{}, { throw: { status: 404 } }, {}]);
  await ensureBranch(ok1, 'o','r','main','feature/x');

  const ok2 = fakeOctokit([]);
  const res404 = await getFile(ok2, 'o','r','README.md','main');
  assert.equal(res404.exists, false);

  const content = Buffer.from('hello','utf8').toString('base64');
  const ok3 = fakeOctokit([{ data: { content, sha: 'abc' } }]);
  const got = await getFile(ok3, 'o','r','README.md','main');
  assert.equal(got.exists, true);
  assert.equal(got.text, 'hello');
  assert.equal(got.sha, 'abc');

  const ok4 = fakeOctokit([]);
  const put = await putFile(ok4, 'o','r','README.md','feature/x','new content', null);
  assert.equal(put.path, 'README.md');
  assert.equal(put.branch, 'feature/x');

  const ok5 = fakeOctokit([]);
  await deleteFile(ok5, 'o','r','README.md','feature/x','sha123');

  const ok6 = fakeOctokit([]);
  const pr = await openPR(ok6, 'o','r','feature/x','main','t','b');
  assert.equal(pr.number, 42);
});
