// lib/billing/calc.mjs
import { getPrice } from './prices.mjs';

/** Heuristic token estimator. Deterministic and cheap.
 * @param {string|Array<{role:string,content:string}>} input
 * @returns {{ inputTokens:number, outputTokens:number }}
 */
export function estimateTokens(input){
  const countWords = (s)=> String(s||'').trim().split(/\s+/).filter(Boolean).length;
  if (Array.isArray(input)){
    let words = 0;
    for (const m of input) words += countWords(m?.content||'');
    const t = Math.ceil(words * 1.3); // ~1.3 tokens per word
    return { inputTokens: t, outputTokens: 0 };
  } else {
    const t = Math.ceil(countWords(String(input)) * 1.3);
    return { inputTokens: t, outputTokens: 0 };
  }
}

/** @param {{provider:string, model:string, inTok:number, outTok:number}} q */
export async function costUsd(q){
  const price = await getPrice({ provider:q.provider, model:q.model });
  if (!price) return 0;
  return (q.inTok/1000) * price.inputPer1KUsd + (q.outTok/1000) * price.outputPer1KUsd;
}
