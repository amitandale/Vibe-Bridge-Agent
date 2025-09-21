// lib/llm/util/estimate.mjs
// Simple deterministic estimator for tests. Not a real tokenizer.
export function estimateTokens({ text, messages } = {}){
  const str = text
    || (Array.isArray(messages) ? messages.map(m => String(m.content ?? '')).join(' ') : '');
  const chars = (str || '').length;
  const inputTokens = Math.max(1, Math.floor(chars / 4));
  const outputTokens = 0;
  return { inputTokens, outputTokens };
}
