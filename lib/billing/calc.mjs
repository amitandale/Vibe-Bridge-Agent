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

/** Structured cost. Returns { dollars, cents } for compatibility with enforcement. */
export async function costUsd({provider, model, inTok, outTok}){
  const price = await getPrice({ provider, model });
  if (!price) return { dollars: 0, cents: 0 };
  const dollars = (inTok/1000) * price.inputPer1KUsd + (outTok/1000) * price.outputPer1KUsd;
  const cents = Math.round(dollars * 100);
  return { dollars, cents };
}

/** Optional numeric helper if needed elsewhere. */
export async function costUsdNumber(q){
  const c = await costUsd(q);
  return c.dollars;
}
