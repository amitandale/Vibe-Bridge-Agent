// tests/workspace.ownership.enforce.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceOwnershipPlan } from '../lib/workspace/ownership.mjs';

test('ownership plan computes chmod and chown ops', () => {
  const root = '/opt/github-runner/p1/ci';
  const inspect = {
    uidOf: (u)=> 2001,
    gidOf: (g)=> 2001,
    statOf: (p)=>({ mode: 0o755, uid: 0, gid: 0 })
  };
  const plan = enforceOwnershipPlan({ root, user:'devops', group:'devops' }, inspect);
  const chmods = plan.ops.filter(o=>o.op==='chmod');
  const chowns = plan.ops.filter(o=>o.op==='chown');
  // should include all target dirs
  const paths = [root, root+'/_work', root+'/env', root+'/logs', root+'/bin'];
  for (const p of paths){
    assert.ok(chmods.find(x=>x.path===p));
    assert.ok(chowns.find(x=>x.path===p));
  }
  // specific mode on _work
  const work = chmods.find(x=>x.path.endsWith('/_work'));
  assert.equal(work.mode, 0o700);
});
