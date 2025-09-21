// lib/llm/providers/anthropic.mjs
import { LlmError, mapStatusToCode, parseRetryAfter } from '../util/errors.mjs';
import { LLM_DEFAULT_TIMEOUT_MS } from '../types.mjs';
import { estimateTokens } from '../util/estimate.mjs';

/**
 * Anthropic Messages API adapter (Claude + Claude Code).
 * @param {{ model:string, apiKey?:string, baseUrl?:string, fetchImpl?:Function, timeoutMs?:number }} opts
 */
export function createAnthropic(opts = {}){
  const {
    model,
    apiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY || '',
    baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/,''),
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.LLM_TIMEOUT_MS || LLM_DEFAULT_TIMEOUT_MS),
  } = opts || {};

  const endpoint = `${baseUrl}/v1/messages`;
  const version = process.env.ANTHROPIC_VERSION || '2023-06-01';

  async function doFetch(body, { stream=false, withTools=false } = {}){
    let attempt = 0, lastErr = null;
    const maxRetries = 2;
    while (attempt <= maxRetries){
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const headers = {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': version,
          'accept': stream ? 'text/event-stream' : 'application/json'
        };
        if (withTools) headers['anthropic-beta'] = 'tools-2024-04-04';

        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers,
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

  function normalizeToolCalls(blocks){
    const out = [];
    for (const b of (blocks || [])){
      if (b && b.type === 'tool_use'){
        out.push({
          id: b.id,
          name: b.name,
          arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {})
        });
      }
    }
    return out.length ? out : undefined;
  }

  function normalizeUsage(u, { messages }){
    if (u && (Number.isFinite(u.input_tokens) || Number.isFinite(u.output_tokens))){
      return {
        inputTokens: Number(u.input_tokens || 0),
        outputTokens: Number(u.output_tokens || 0)
      };
    }
    // Estimate if missing
    const est = estimateTokens({ messages });
    return { inputTokens: est.inputTokens, outputTokens: est.outputTokens };
  }

  function mapStopReason(r){
    if (!r) return 'stop';
    if (r === 'tool_use') return 'tool_calls';
    if (r === 'max_tokens') return 'length';
    return 'stop';
  }

  function toAnthropicMessages({ messages, system }){
    const out = [];
    if (Array.isArray(messages)){
      for (const m of messages){
        if (m.role === 'user' || m.role === 'assistant'){
          out.push({ role: m.role, content: [{ type:'text', text: String(m.content ?? '') }] });
        } else if (m.role === 'system'){
          // will be passed via top-level system field
        } else if (m.role === 'tool'){
          // tool result should be carried by the *next* user turn; keep simple for now
          out.push({ role: 'user', content: [{ type:'tool_result', tool_use_id: m.tool_call_id || '', content: String(m.content ?? '') }] });
        }
      }
    }
    return { messages: out, system };
  }

  async function chat({ messages, system, tools, tool_choice, temperature, maxTokens, stream } = {}){
    const mm = toAnthropicMessages({ messages, system });
    const hasTools = Array.isArray(tools) && tools.length > 0;
    const body = {
      model,
      messages: mm.messages,
      ...(mm.system ? { system: String(mm.system) } : {}),
      ...(hasTools ? { tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema || t.parameters || {} })) } : {}),
      ...(tool_choice ? { tool_choice } : {}),
      temperature,
      max_tokens: maxTokens || 1024,
      stream: !!stream
    };

    if (stream){
      const res = await doFetch(body, { stream:true, withTools: hasTools });
      const text = await res.text();
      // Parse Anthropic SSE: look for lines with JSON having { delta:{type:'text_delta', text} } or { type:'content_block_delta', delta:{...} }
      const lines = String(text).split(/\r?\n/).map(s => s.replace(/^data:\s?/, '').trim()).filter(Boolean);
      const deltas = [];
      for (const line of lines){
        if (line === '[DONE]') continue;
        try {
          const obj = JSON.parse(line);
          const td = obj?.delta || obj?.content_block?.delta || obj?.content_block_delta || null;
          const txt = td?.text || td?.content || null;
          if (typeof txt === 'string' && txt) deltas.push(txt);
        } catch {}
      }
      async function* iterator(){
        for (const d of deltas) yield { delta: d };
      }
      return { [Symbol.asyncIterator]: iterator };
    }

    const res = await doFetch(body, { stream:false, withTools: hasTools });
    const data = await res.json();
    const content = Array.isArray(data?.content) ? data.content : [];
    const textBlocks = content.filter(b => b?.type === 'text').map(b => String(b.text || ''));
    const text = textBlocks.join('');
    const tool_calls = normalizeToolCalls(content);
    const usage = normalizeUsage(data?.usage, { messages });
    const finish = mapStopReason(data?.stop_reason);
    return { text, tool_calls, usage, finish };
  }

  return { chat };
}
