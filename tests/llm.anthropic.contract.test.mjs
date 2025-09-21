// tests/llm.anthropic.contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlm } from '../lib/llm/index.mjs';

function makeOk(json){
  return new Response(JSON.stringify(json), { status:200, headers:{ 'content-type':'application/json' } });
}

test('headers and endpoint for non-stream, with tools', async () => {
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, init });
    return makeOk({ content:[{ type:'text', text:'hello' }], usage:{ input_tokens: 5, output_tokens: 2 }, stop_reason:'end_turn' });
  };
  const llm = createLlm({ provider:'anthropic', model:'claude-3-haiku', apiKey:'A', fetchImpl: fake });
  const out = await llm.chat({
    messages:[{ role:'user', content:'hi' }],
    tools:[{ name:'t1', description:'d', input_schema:{ type:'object', properties:{} } }],
    maxTokens: 64
  });
  assert.equal(out.text, 'hello');
  assert.match(calls[0].url, /\/v1\/messages$/);
  assert.equal(calls[0].init.headers['x-api-key'], 'A');
  assert.ok(calls[0].init.headers['anthropic-version']);
  assert.equal(calls[0].init.headers['anthropic-beta'], 'tools-2024-04-04');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'claude-3-haiku');
  assert.equal(body.max_tokens, 64);
});

test('tool_use blocks normalize to tool_calls[]', async () => {
  const fake = async () => makeOk({
    content:[
      { type:'tool_use', id:'call_1', name:'plan', input:{ a:1 } },
      { type:'text', text:'pending' }
    ],
    stop_reason:'tool_use'
  });
  const llm = createLlm({ provider:'anthropic', model:'claude-3-haiku', apiKey:'k', fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'x' }] });
  assert.equal(out.text, 'pending');
  assert.equal(out.finish, 'tool_calls');
  assert.equal(out.tool_calls.length, 1);
  assert.equal(out.tool_calls[0].name, 'plan');
  assert.match(out.tool_calls[0].arguments, /"a":\s*1/);
});

test('usage fallback uses estimator when missing', async () => {
  const fake = async () => makeOk({ content:[{ type:'text', text:'ok' }], stop_reason:'end_turn' });
  const llm = createLlm({ provider:'anthropic', model:'claude-3-haiku', apiKey:'k', fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'1234567890' }] });
  // estimator: chars/4 floored
  assert.ok(out.usage.inputTokens >= 2);
  assert.equal(out.usage.outputTokens, 0);
});

test('retries on 429 then succeeds honoring Retry-After', async () => {
  let n = 0;
  const fake = async (url, init) => {
    n++;
    if (n === 1){
      return new Response('rate', { status:429, headers:{ 'retry-after': '0.01' } });
    }
    return makeOk({ content:[{ type:'text', text:'ok' }], usage:{ input_tokens:1, output_tokens:1 }, stop_reason:'end_turn' });
  };
  const llm = createLlm({ provider:'anthropic', model:'claude-3-haiku', apiKey:'k', fetchImpl: fake });
  const out = await llm.chat({ messages:[{ role:'user', content:'x' }] });
  assert.equal(out.text, 'ok');
  assert.equal(n, 2);
});

test('maps 401 to PROVIDER_UNAUTHORIZED', async () => {
  const fake = async () => new Response('no', { status:401 });
  const llm = createLlm({ provider:'anthropic', model:'claude-3-haiku', apiKey:'bad', fetchImpl: fake });
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
  const llm = createLlm({ provider:'anthropic', model:'claude-3-haiku', apiKey:'k', fetchImpl: fake, timeoutMs: 10 });
  await assert.rejects(() => llm.chat({ messages:[{role:'user', content:'x'}] }), err => err && err.code === 'TIMEOUT');
});

test('streaming text deltas are assembled', async () => {
  const sse = [
    'event: message_start\n\n',
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
    'data: [DONE]'
  ].join('\n');
  const fake = async () => new Response(sse, { status:200, headers:{ 'content-type':'text/event-stream' } });
  const llm = createLlm({ provider:'anthropic', model:'claude-3-haiku', apiKey:'k', fetchImpl: fake });
  const it = await llm.chat({ messages:[{ role:'user', content:'x' }], stream:true });
  let acc = '';
  for await (const e of it){
    acc += e.delta || '';
  }
  assert.equal(acc, 'Hello');
});
