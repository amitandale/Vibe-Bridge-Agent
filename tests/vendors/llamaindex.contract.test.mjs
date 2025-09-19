import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeLlamaIndexClient } from '../../lib/vendors/llamaindex.client.mjs';

test('llamaindex client signs and posts /query and /index/upsert', async () => {
  let seen = [];
  const fakeFetch = async (url, init) => {
    const bodyStr = init.body ?? '';
    const sig = createHmac('sha256', 'key123').update(Buffer.from(bodyStr)).digest('hex');
    const headers = init.headers;
    // Check headers
    const get = (k) => headers.get ? headers.get(k) : headers[k.toLowerCase()] || headers[k];
    assert.equal(get('x-vibe-project'), 'projA');
    assert.equal(get('x-vibe-kid'), 'kid1');
    assert.equal(get('x-signature'), `sha256=${sig}`);
    seen.push({ url, body: bodyStr });
    // Respond success
    return {
      ok: true,
      status: 200,
      headers: new Map([['content-type','application/json']]),
      json: async () => url.endsWith('/query')
        ? { nodes: [{ id: 'n1', text: 't', path: 'p', span: { start: 0, end: 1 }, score: 0.5 }] }
        : { docIds: ['doc_1'] }
    };
  };

  const client = makeLlamaIndexClient({ baseUrl: 'http://x', projectId: 'projA', kid: 'kid1', key: 'key123', fetchImpl: fakeFetch });
  const q = await client.query({ projectId: 'projA', query: 'hello', k: 3 });
  assert.ok(Array.isArray(q.nodes) && q.nodes.length === 1);
  const u = await client.upsert({ projectId: 'projA', docs: [{ path: 'a', mime: 'text/plain', content: 'X' }], idempotencyKey: 'abc' });
  assert.ok(Array.isArray(u.docIds));
  assert.equal(seen.length, 2);
  assert.ok(seen[0].url.endsWith('/query'));
  assert.ok(seen[1].url.endsWith('/index/upsert'));
});
