// lib/llm/providers/perplexity.mjs
import { LlmError, mapStatusToCode, parseRetryAfter } from '../util/errors.mjs';
import { LLM_DEFAULT_TIMEOUT_MS } from '../types.mjs';

/**
 * Create a Perplexity adapter.
 * @param {{ model:string, apiKey?:string, baseUrl?:string, fetchImpl?:Function }} opts
 */
export function createPerplexity(opts={}){
  const {
    model,
    apiKey = process.env.PPLX_API_KEY || process.env.LLM_API_KEY || '',
    baseUrl = (process.env.PPLX_BASE_URL || 'https://api.perplexity.ai').replace(/\/+$/,''),
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.LLM_TIMEOUT_MS || LLM_DEFAULT_TIMEOUT_MS),
  } = opts || {};

  const endpoint = `${baseUrl}/chat/completions`;

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

  async function chat({ messages, system, tools, tool_choice, temperature, maxTokens, stream } = {}){
    const payload = {
      model,
      messages: [
        ...(system ? [{ role:'system', content: String(system) }] : []),
        ...(Array.isArray(messages) ? messages : [])
      ],
      temperature,
      max_tokens: maxTokens,
      stream: !!stream,
      tools,
      tool_choice
    };

    if (stream){
      const res = await doFetch(payload, { stream:true });
      const text = await res.text();
      const { parseSse } = await import('../util/stream.mjs');
      const items = Array.from(parseSse(text));
      async function* iterator(){
        for (const it of items){
          if (it.delta) yield { delta: it.delta };
        }
      }
      return { [Symbol.asyncIterator]: iterator };
    }

    const res = await doFetch(payload, { stream:false });
    const data = await res.json();
    const choice = data.choices?.[0] || {};
    const msg = choice.message || {};
    const tool_calls = msg.tool_calls?.map(t => ({
      id: t.id,
      name: t.function?.name,
      arguments: t.function?.arguments
    }));
    const usage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0
    };
    const finish = choice.finish_reason || 'stop';
    return { text: msg.content || '', tool_calls, usage, finish };
  }

  return { chat };
}
