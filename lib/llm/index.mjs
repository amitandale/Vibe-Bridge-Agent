// lib/llm/index.mjs
import { LLM_DEFAULT_TIMEOUT_MS } from './types.mjs';
import { createPerplexity } from './providers/perplexity.mjs';
import { createAnthropic } from './providers/anthropic.mjs';

/**
 * Factory: create an LLM client by provider.
 * @param {{ provider?:string, model?:string, apiKey?:string, baseUrl?:string, fetchImpl?:Function, timeoutMs?:number }} cfg
 */
export function createLlm(cfg={}){
  const provider = (cfg.provider || process.env.LLM_PROVIDER || 'perplexity').toLowerCase();
  const model = cfg.model || process.env.LLM_MODEL || 'pplx-7b-chat';
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
  throw new Error(`Unknown LLM provider: ${provider}`);
}
