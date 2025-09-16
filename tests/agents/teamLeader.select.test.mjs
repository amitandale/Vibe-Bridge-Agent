import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectRetriever } from '../../lib/context/retrievers/select.mjs';

test('selectRetriever honors prefer override: cody', async () => {
  const calls = [];
  const retrieve = selectRetriever({
    prefer: 'cody',
    adapters: {
      codyRetrieve: async (ctx, q) => { calls.push(['c', q]); return [{ id: 'cody', q }]; },
      llamaRetrieve: async (ctx, q) => { calls.push(['l', q]); return [{ id: 'llama', q }]; }
    }
  });
  const out = await retrieve({}, 'find usages of deploy.sh');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'c');
  assert.deepEqual(out, [{ id: 'cody', q: 'find usages of deploy.sh' }]);
});

test('selectRetriever defaults to llamaindex when auto', async () => {
  const calls = [];
  const retrieve = selectRetriever({
    env: { BA_RETRIEVER: 'auto' },
    adapters: {
      codyRetrieve: async (ctx, q) => { calls.push(['c', q]); return [{ id: 'cody', q }]; },
      llamaRetrieve: async (ctx, q) => { calls.push(['l', q]); return [{ id: 'llama', q }]; }
    }
  });
  const out = await retrieve({}, 'design doc for deploy flow');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'l');
  assert.deepEqual(out, [{ id: 'llama', q: 'design doc for deploy flow' }]);
});
