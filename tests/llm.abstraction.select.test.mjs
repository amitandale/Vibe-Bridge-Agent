// tests/llm.abstraction.select.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../lib/llm/index.mjs';

function makeSseResponse(chunks){
  const text = chunks.join('\n\n');
  return new Response(text, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  });
}

test('provider selection uses env defaults when omitted', async () => {
  process.env.LLM_PROVIDER = 'perplexity';
  process.env.LLM_MODEL = 'pplx-mini';
  const fake = async () => new Response(JSON.stringify({ choices:[{ message:{ content:'ok' }, finish_reason:'stop' }], usage:{} }), { status:200 });
  const llm = createLlm({ fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'x' }] });
  assert.equal(out.text, 'ok');
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_MODEL;
});

test('streaming assembly yields deltas', async () => {
  const sse = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}',
    'data: {"choices":[{"delta":{"content":"lo"}}]}',
    'data: [DONE]'
  ];
  const fake = async () => makeSseResponse(sse);
  const llm = createLlm({ provider:'perplexity', model:'p', apiKey:'k', fetchImpl: fake });
  const it = await llm.chat({ messages:[{ role:'user', content:'x' }], stream:true });
  let acc = '';
  for await (const e of it){
    acc += e.delta || '';
  }
  assert.equal(acc, 'Hello');
});
