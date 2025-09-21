// tests/llm.perplexity.contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../lib/llm/index.mjs';

function makeOkResponse(json){
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

test('headers and body mapping; non-stream', async () => {
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, init });
    return makeOkResponse({
      choices: [{ message: { content: 'hi' }, finish_reason:'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 2 }
    });
  };
  const llm = createLlm({ provider:'perplexity', model:'pplx-mini', apiKey:'key123', fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'ping' }] });
  assert.equal(out.text, 'hi');
  assert.equal(out.usage.inputTokens, 3);
  assert.equal(out.finish, 'stop');
  assert.match(calls[0].url, /\/chat\/completions$/);
  assert.equal(calls[0].init.headers['authorization'], 'Bearer key123');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
});

test('retries on 429 then succeeds honoring Retry-After', async () => {
  let n = 0;
  const fake = async (url, init) => {
    n++;
    if (n === 1){
      return new Response('rate', { status:429, headers:{ 'retry-after': '0.01' } });
    }
    return makeOkResponse({ choices:[{ message:{ content:'ok' }, finish_reason:'stop' }], usage:{} });
  };
  const llm = createLlm({ provider:'perplexity', model:'pplx-mini', apiKey:'k', fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'x' }] });
  assert.equal(out.text, 'ok');
  assert.equal(n, 2);
});

test('maps 401 to PROVIDER_UNAUTHORIZED', async () => {
  const fake = async () => new Response('no', { status:401 });
  const llm = createLlm({ provider:'perplexity', model:'p', apiKey:'bad', fetchImpl: fake });
  await assert.rejects(() => llm.chat({ messages:[] }), err => err && err.code === 'PROVIDER_UNAUTHORIZED');
});

test('timeout produces TIMEOUT', async () => {
  const fake = async (url, init) => {
    await new Promise((_, rej) => {
      if (init?.signal){
        const onAbort = () => rej(Object.assign(new Error('Aborted'), { name:'AbortError' }));
        if (init.signal.aborted) onAbort();
        else init.signal.addEventListener('abort', onAbort, { once:true });
      }
    });
    return new Response('x', { status:200 });
  };
  const llm = createLlm({ provider:'perplexity', model:'p', apiKey:'k', fetchImpl: fake, timeoutMs: 10 });
  await assert.rejects(() => llm.chat({ messages:[{role:'user', content:'x'}] }), err => err && err.code === 'TIMEOUT');
});
