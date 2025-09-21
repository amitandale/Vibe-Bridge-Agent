// lib/llm/wrap.mjs
let _prices = null, _calc = null;
async function getDeps(){
  if (!_prices){
    try { _prices = await import('../billing/prices.mjs'); } catch { _prices = {}; }
  }
  if (!_calc){
    try { _calc = await import('../billing/calc.mjs'); } catch { _calc = {}; }
  }
  return { getPrice: _prices.getPrice, costUsd: _calc.costUsd };
}

let _estimateTokens = null;
async function estimate(input){
  if (!_estimateTokens){
    try { ({ estimateTokens: _estimateTokens } = await import('./util/estimate.mjs')); }
    catch { _estimateTokens = () => ({ inputTokens: 1, outputTokens: 0 }); }
  }
  return _estimateTokens(input);
}

import { checkBudget, recordUsage } from '../billing/enforce.mjs';

function knownProviderError(e){
  return !!(e && (e.code === 'PROVIDER_UNAUTHORIZED' || e.code === 'PROVIDER_FORBIDDEN' || e.code === 'PROVIDER_NOT_FOUND' || e.code === 'RATE_LIMITED' || e.code === 'UPSTREAM_UNAVAILABLE' || e.code === 'UPSTREAM_ERROR' || e.code === 'TIMEOUT'));
}

function genId(){
  const r = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  return `${t}${r}`;
}

export function withBudget(llm, { projectId, prId } = {}){
  const enforcement = (String(process.env.BUDGET_ENFORCEMENT || 'on').toLowerCase());
  const bypass = enforcement === 'off';
  return {
    async chat(opts = {}){
      const { getPrice, costUsd } = await getDeps();
      const provider = (opts.provider || process.env.LLM_PROVIDER || 'perplexity');
      const model = (opts.model || process.env.LLM_MODEL || 'pplx-7b-chat');
      const callId = opts.callId || genId();
      const est = await estimate({ messages: opts.messages || opts.text || '' });

      if (!bypass){
        const ck = await checkBudget({ projectId, prId, provider, model, estimate: est });
        if (!ck.allowed) {
          const err = new Error('BUDGET_EXCEEDED'); err.code = 'BUDGET_EXCEEDED'; throw err;
        }
        try {
          const res = await llm.chat(opts);
          const price = getPrice ? getPrice({ provider, model }) : null;
          const usage = res?.usage || { inputTokens: est.inputTokens, outputTokens: 0 };
          const c = price && costUsd ? costUsd({ provider, model, inTok: usage.inputTokens || 0, outTok: usage.outputTokens || 0 }) : { dollars:0, cents:0 };
          await recordUsage({ callId, provider, model, inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0, costUsd: (c.dollars || 0) + (c.cents || 0)/100, projectId, prId }).catch(()=>{});
          return ck.softWarn ? { ...res, softWarn: true } : res;
        } catch (e) {
          if (knownProviderError(e) && getPrice && costUsd){
            const price = getPrice({ provider, model });
            if (price){
              const c = costUsd({ provider, model, inTok: est.inputTokens, outTok: 0 });
              await recordUsage({ callId, provider, model, inputTokens: est.inputTokens, outputTokens: 0, costUsd: (c.dollars || 0) + (c.cents || 0)/100, projectId, prId, errorCode: e.code || 'UPSTREAM_ERROR' }).catch(()=>{});
            }
          }
          throw e;
        }
      } else {
        return llm.chat(opts);
      }
    }
  };
}
