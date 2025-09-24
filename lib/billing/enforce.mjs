// lib/billing/enforce.mjs
let _estimateTokens = null;
async function estimate(input){
  if (!_estimateTokens){
    try { ({ estimateTokens: _estimateTokens } = await import('../llm/util/estimate.mjs')); }
    catch { _estimateTokens = () => ({ inputTokens: 1, outputTokens: 0 }); }
  }
  return _estimateTokens(input);
}

class BillingError extends Error {
  constructor(message, code){ super(message); this.name='BillingError'; this.code=code; }
}

async function loadDeps(){
  const prices = await import('./prices.mjs').catch(() => ({}));
  const store = await import('./store.mjs').catch(() => ({}));
  const calc  = await import('./calc.mjs').catch(() => ({}));
  return {
    getPrice: prices.getPrice,
    loadBudgets: store.loadBudgets,
    queryUsage: store.queryUsage,
    recordUsage: store.recordUsage,
    costUsd: calc.costUsd
  };
}

function windowStartFor(budget, now = new Date()){
  if (budget.period === 'month'){
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0,0,0,0));
  }
  return new Date(0); // once: all-time
}

export async function checkBudget({ projectId, prId, provider, model, estimate: estIn }){
  const deps = await loadDeps();
  const price = deps.getPrice ? deps.getPrice({ provider, model }) : null;
  if (!price) return { allowed:true, priceMissing:true, currentCents:0 };

  const budgets = deps.loadBudgets ? await deps.loadBudgets() : [];
  const now = new Date();
  const scoped = budgets.filter(b => b.active !== false && (
    (projectId && b.scope==='project' && b.scopeId===String(projectId)) ||
    (prId && b.scope==='pr' && b.scopeId===String(prId))
  ));
  if (!scoped.length) return { allowed:true, currentCents:0 };

  const since = windowStartFor(scoped[0], now).toISOString();
  const usage = deps.queryUsage ? await deps.queryUsage({ projectId, prId, since }) : [];
  const currentCents = (usage || []).reduce((acc, ev) => acc + Math.round((ev.costUsd || 0)*100), 0);

  const est = estIn || await estimate({ messages: [] });
  const inTok = est.inputTokens ?? 0;
  const outTok = est.outputTokens ?? 0;
  let __estCents = 0;
  if (deps.costUsd) {
    const _c = await deps.costUsd({ provider, model, inTok, outTok });
    if (typeof _c === 'number') { __estCents = Math.round(_c * 100); }
    else if (_c && typeof _c === 'object') { __estCents = _c.cents ?? Math.round(((_c.dollars||0)*100) + (_c.cents||0)); }
  }
  const estCents = __estCents;

  let hardCents = null, softCents = null;
  for (const b of scoped){
    const h = Math.round((b.hardUsd || 0) * 100);
    const s = b.softUsd != null ? Math.round(b.softUsd * 100) : null;
    hardCents = hardCents == null ? h : Math.min(hardCents, h);
    if (s != null) softCents = softCents == null ? s : Math.min(softCents, s);
  }

  if (hardCents != null && currentCents + estCents > hardCents){
    return { allowed:false, hardExceeded:true, currentCents, hardCents, softCents };
  }
  const softWarn = softCents != null && currentCents + estCents > softCents;
  return { allowed:true, softWarn, currentCents, hardCents, softCents };
}

export async function recordUsage(event){
  const deps = await loadDeps();
  if (!deps.recordUsage) throw new BillingError('Store not available', 'STORE_IO_ERROR');
  return deps.recordUsage(event);
}

export const _internal = { windowStartFor, BillingError };
