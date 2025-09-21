// tests/llm.grok.contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../lib/llm/index.mjs';

function ok(json){
  return new Response(JSON.stringify(json), { status:200, headers:{ 'content-type':'application/json' } });
}

test('headers and endpoint', async () => {
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, init }); return ok({ choices:[{ message:{ content:'yo' }, finish_reason:'stop' }], usage:{ prompt_tokens:1, completion_tokens:1 } }); };
  const llm = createLlm({ provider:'grok', model:'grok-beta', apiKey:'xai-1', fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'hi' }], maxTokens: 64 });
  assert.equal(out.text, 'yo');
  assert.match(calls[0].url, /\/v1\/chat\/completions$/);
  assert.equal(calls[0].init.headers['authorization'], 'Bearer xai-1');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'grok-beta');
  assert.equal(body.max_tokens, 64);
});

test('tool_calls normalization', async () => {
  const fake = async () => ok({
    choices:[{
      message:{
        content: null,
        tool_calls:[{ id:'tc1', type:'function', function:{ name:'search', arguments:'{"q":"x"}' } }]
      },
      finish_reason:'tool_calls'
    }]
  });
  const llm = createLlm({ provider:'grok', model:'grok-beta', apiKey:'k', fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'x' }] });
  assert.equal(out.finish, 'tool_calls');
  assert.equal(out.tool_calls.length, 1);
  assert.equal(out.tool_calls[0].name, 'search');
  assert.match(out.tool_calls[0].arguments, /"q":\s*"x"/);
});

test('usage fallback when missing', async () => {
  const fake = async () => ok({ choices:[{ message:{ content:'ok' }, finish_reason:'stop' }] });
  const llm = createLlm({ provider:'grok', model:'grok-beta', apiKey:'k', fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'abcdefghij' }] });
  assert.ok(out.usage.inputTokens >= 2);
  assert.equal(out.usage.outputTokens, 0);
});

test('retries on 429 then succeeds honoring Retry-After', async () => {
  let n = 0;
  const fake = async () => {
    n++;
    if (n === 1) return new Response('rate', { status:429, headers:{ 'retry-after':'0.01' } });
    return ok({ choices:[{ message:{ content:'ok' }, finish_reason:'stop' }], usage:{ prompt_tokens:1, completion_tokens:1 } });
  };
  const llm = createLlm({ provider:'grok', model:'grok-beta', apiKey:'k', fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'x' }] });
  assert.equal(out.text, 'ok');
  assert.equal(n, 2);
});

test('maps 401 to PROVIDER_UNAUTHORIZED', async () => {
  const fake = async () => new Response('no', { status:401 });
  const llm = createLlm({ provider:'grok', model:'grok-beta', apiKey:'bad', fetchImpl: fake });
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
  const llm = createLlm({ provider:'grok', model:'grok-beta', apiKey:'k', fetchImpl: fake, timeoutMs: 10 });
  await assert.rejects(() => llm.chat({ messages:[{role:'user', content:'x'}] }), err => err && err.code === 'TIMEOUT');
});

test('streaming deltas', async () => {
  const sse = [
    'data: {"choices":[{"delta":{"content":"Gro"}}]}',
    'data: {"choices":[{"delta":{"content":"k!"}}]}',
    'data: [DONE]'
  ].join('\n');
  const fake = async () => new Response(sse, { status:200, headers:{ 'content-type':'text/event-stream' } });
  const llm = createLlm({ provider:'grok', model:'grok-beta', apiKey:'k', fetchImpl: fake });
  const it = await llm.chat({ messages:[{ role:'user', content:'x' }], stream:true });
  let acc = '';
  for await (const e of it){ acc += e.delta || ''; }
  assert.equal(acc, 'Grok!');
});
