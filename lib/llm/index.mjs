// lib/llm/index.mjs
import { LLM_DEFAULT_TIMEOUT_MS } from './types.mjs';
import { createPerplexity } from './providers/perplexity.mjs';
import { createAnthropic } from './providers/anthropic.mjs';
import { createOpenAI } from './providers/openai.mjs';
import { createGrok } from './providers/grok.mjs';

/**
 * Factory: create an LLM client by provider.
 * @param {{ provider?:string, model?:string, apiKey?:string, baseUrl?:string, fetchImpl?:Function, timeoutMs?:number }} cfg
 */
export function createLlm(cfg={}){
  const provider = (cfg.provider || process.env.LLM_PROVIDER || 'perplexity').toLowerCase();
  const model = cfg.model || process.env.LLM_MODEL || (provider === 'openai' || provider === 'oai' ? 'gpt-4o-mini' : provider === 'grok' || provider === 'xai' ? 'grok-beta' : 'pplx-7b-chat');
  const common = {
    model,
    apiKey: cfg.apiKey || process.env.LLM_API_KEY,
    baseUrl: cfg.baseUrl,
    fetchImpl: cfg.fetchImpl || globalThis.fetch,
    timeoutMs: Number(cfg.timeoutMs || process.env.LLM_TIMEOUT_MS || LLM_DEFAULT_TIMEOUT_MS),
  };
  if (provider === 'perplexity' || provider === 'pplx') return createPerplexity(common);
  if (provider === 'anthropic' || provider === 'claude') return createAnthropic({
    ...common,
    apiKey: cfg.apiKey || process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY,
    baseUrl: cfg.baseUrl || process.env.ANTHROPIC_BASE_URL
  });
  if (provider === 'openai' || provider === 'oai') return createOpenAI({
    ...common,
    apiKey: cfg.apiKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY,
    baseUrl: cfg.baseUrl || process.env.OPENAI_BASE_URL
  });
  if (provider === 'grok' || provider === 'xai') return createGrok({
    ...common,
    apiKey: cfg.apiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.LLM_API_KEY,
    baseUrl: cfg.baseUrl || process.env.GROK_BASE_URL || process.env.XAI_BASE_URL
  });
  throw new Error(`Unknown LLM provider: ${provider}`);
}
