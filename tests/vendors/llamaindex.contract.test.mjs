import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeLlamaIndexClient } from '../../lib/vendors/llamaindex.client.mjs';

test('llamaindex client signs and handles /query and /index/upsert with retry/backoff', async () => {
  let calls = 0;
  const started = Date.now();
  const fakeFetch = async (url, init) => {
    calls += 1;
    const bodyStr = typeof init.body === 'string' ? init.body : '';
    const sig = createHmac('sha256', 'k1').update(Buffer.from(bodyStr)).digest('hex');
    const headers = init.headers;
    const get = (k) => headers.get ? headers.get(k) : headers[k.toLowerCase()] || headers[k];
    assert.equal(get('x-vibe-project'), 'proj1');
    assert.equal(get('x-vibe-kid'), 'kid1');
    assert.ok(get('x-signature').endsWith(sig));
    if (url.endsWith('/query') && calls === 1) return { ok: false, status: 500, headers: new Map([['retry-after','']]), text: async () => '' };
    if (url.endsWith('/query')) return { ok: true, status: 200, headers: new Map([['content-type','application/json']]), json: async () => ({ nodes: [{ id: 'n1', text: 't', path: 'p', span: { start: 0, end: 1 }, score: 0.5 }] }) };
    return { ok: true, status: 200, headers: new Map([['content-type','application/json']]), json: async () => ({ docIds: ['doc_1'] }) };
  };
  const client = makeLlamaIndexClient({ baseUrl: 'http://x', projectId: 'proj1', kid: 'kid1', key: 'k1', fetchImpl: fakeFetch });
  const q = await client.query({ projectId: 'proj1', query: 'hello', k: 2 });
  const elapsed = Date.now() - started;
  assert.ok(Array.isArray(q.nodes) && q.nodes.length === 1);
  assert.ok(elapsed >= 200 && elapsed < 3000);
  const u = await client.upsert({ projectId: 'proj1', docs: [{ path: 'a', mime: 'text/plain', content: 'X' }], idempotencyKey: 'abc' });
  assert.ok(Array.isArray(u.docIds));
});
