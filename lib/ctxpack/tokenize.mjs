// lib/ctxpack/tokenize.mjs
// Deterministic token estimators pinned per model id.
// Wraps the existing util estimator to avoid drift.
import { estimateTokens as baseEstimate } from '../llm/util/estimate.mjs';

/**
 * Returns a function estimateTokens({text|messages}) -> { inputTokens, outputTokens }
 * The mapping is pinned so tests are stable.
 */
export async function getTokenizer(modelId='default'){
  // In a real impl, swap by modelId to a specific tokenizer.
  // For now we use the deterministic base estimator for all known ids.
  const known = new Set(['default','bge-small-en','bge-small-en-v1','gpt-4o-mini','claude-3-haiku']);
  if (!known.has(String(modelId || ''))) {
    // Unknown models still fall back to base for stability.
    return baseEstimate;
  }
  return baseEstimate;
}
