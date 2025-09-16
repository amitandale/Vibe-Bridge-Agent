// tests/runner.github.adapter.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { listRemote } from '../lib/runner/github.adapter.mjs';

test('github.listRemote maps and filters labels', async () => {
  const data = { runners: [
    { id:1, name:'p1-ci-1', status:'online', labels:[{name:'self-hosted'},{name:'vibe'},{name:'p1'},{name:'ci'}] },
    { id:2, name:'p2-ci-1', status:'offline', labels:[{name:'self-hosted'},{name:'vibe'},{name:'p2'},{name:'ci'}] }
  ]};
  const fetcher = async (url, opts)=>({ ok:true, async json(){ return data; } });
  const items = await listRemote({ owner:'o', repo:'r', fetcher }, { labels:['vibe','p1','ci'] });
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'p1-ci-1');
});
