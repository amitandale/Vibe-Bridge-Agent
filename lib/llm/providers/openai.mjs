// lib/llm/providers/openai.mjs
import { LlmError, mapStatusToCode, parseRetryAfter } from '../util/errors.mjs';
import { LLM_DEFAULT_TIMEOUT_MS } from '../types.mjs';
import { estimateTokens } from '../util/estimate.mjs';

/**
 * OpenAI Chat Completions adapter.
 * @param {{ model:string, apiKey?:string, baseUrl?:string, fetchImpl?:Function, timeoutMs?:number }} opts
 */
export function createOpenAI(opts = {}){
  const {
    model,
    apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '',
    baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/,''),
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.LLM_TIMEOUT_MS || LLM_DEFAULT_TIMEOUT_MS),
  } = opts || {};

  const endpoint = `${baseUrl}/v1/chat/completions`;

  async function doFetch(body, { stream=false } = {}){
    let attempt = 0, lastErr = null;
    const maxRetries = 2;
    while (attempt <= maxRetries){
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'accept': stream ? 'text/event-stream' : 'application/json',
            'authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(body),
          signal: ac.signal
        });
        clearTimeout(t);
        if (!res.ok){
          const { code } = mapStatusToCode(res.status);
          if ((res.status === 429 || (res.status >= 500 && res.status <= 599)) && attempt < maxRetries){
            const backoff = parseRetryAfter(res.headers?.get?.('retry-after')) || (50 * (attempt + 1));
            attempt++;
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          throw new LlmError(`HTTP ${res.status}`, { code, status: res.status });
        }
        return res;
      } catch (e){
        clearTimeout(t);
        lastErr = e;
        if (attempt < maxRetries){
          attempt++;
          await new Promise(r => setTimeout(r, 25 * attempt));
          continue;
        }
        if (e && e.name === 'AbortError'){
          throw new LlmError('Timeout', { code:'TIMEOUT', status:0 });
        }
        throw e;
      }
    }
    if (lastErr) throw lastErr;
    throw new LlmError('Unknown error');
  }

  function normalizeToolCalls(msg){
    const tcs = msg?.tool_calls;
    if (!Array.isArray(tcs) || tcs.length === 0) return undefined;
    return tcs.map(tc => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: tc.function?.arguments
    }));
  }

  function normalizeUsage(u, { messages }){
    if (u && (Number.isFinite(u.prompt_tokens) || Number.isFinite(u.completion_tokens))){
      return {
        inputTokens: Number(u.prompt_tokens || 0),
        outputTokens: Number(u.completion_tokens || 0)
      };
    }
    const est = estimateTokens({ messages });
    return { inputTokens: est.inputTokens, outputTokens: est.outputTokens };
  }

  function mapFinishReason(r){
    if (!r) return 'stop';
    if (r === 'tool_calls') return 'tool_calls';
    if (r === 'length') return 'length';
    return 'stop';
  }

  async function chat({ messages, system, tools, tool_choice, temperature, maxTokens, stream } = {}){
    // OpenAI supports system in messages; include if provided
    const msgs = [
      ...(system ? [{ role:'system', content:String(system) }] : []),
      ...(Array.isArray(messages) ? messages : [])
    ];

    const body = {
      model,
      messages: msgs,
      temperature,
      max_tokens: maxTokens,
      stream: !!stream
    };

    if (Array.isArray(tools) && tools.length){
      body.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema || t.parameters || {} } }));
    }
    if (tool_choice) body.tool_choice = tool_choice;

    if (stream){
      const res = await doFetch(body, { stream:true });
      const text = await res.text();
      const lines = String(text).split(/\r?\n/).map(s => s.replace(/^data:\s?/, '').trim()).filter(Boolean);
      const deltas = [];
      for (const line of lines){
        if (line === '[DONE]') continue;
        try {
          const obj = JSON.parse(line);
          const d = obj?.choices?.[0]?.delta?.content;
          if (typeof d === 'string' && d) deltas.push(d);
        } catch {}
      }
      async function* iterator(){
        for (const d of deltas) yield { delta: d };
      }
      return { [Symbol.asyncIterator]: iterator };
    }

    const res = await doFetch(body, { stream:false });
    const data = await res.json();
    const choice = data.choices?.[0] || {};
    const msg = choice.message || {};
    const tool_calls = normalizeToolCalls(msg);
    const usage = normalizeUsage(data.usage, { messages });
    const finish = mapFinishReason(choice.finish_reason);
    return { text: msg.content || '', tool_calls, usage, finish };
  }

  return { chat };
}
