import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRetriever } from '../../lib/context/retrievers/select.mjs';

test('llamaindex-remote retriever selected by env and calls remote with LI_TOP_K', async () => {
  const env = { BA_RETRIEVER: 'llamaindex-remote', LI_TOP_K: '2', PROJECT_ID: 'projZ', CI: 'true', LLAMAINDEX_URL: 'http://x' };
  const captured = [];
  const fakeFetch = async (_url, init) => {
    const bodyStr = typeof init.body === 'string' ? init.body : '';
    captured.push(JSON.parse(bodyStr));
    return { ok: true, status: 200, headers: new Map([['content-type','application/json']]), json: async () => ({ nodes: [{ id: 'n1', text: 'T', path: 'file', span: { start: 0, end: 9 }, score: 0.8 }] }) };
  };
  const retrieve = await selectRetriever({ env });
  const out = await retrieve({ env, fetch: fakeFetch, projectId: 'projZ' }, 'question');
  assert.ok(Array.isArray(out));
  assert.equal(out[0].text, 'T');
  assert.equal(captured[0].k, 2);
  assert.equal(captured[0].projectId, 'projZ');
});
