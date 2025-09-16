// ALGO specialist harness. Optional scoped retrieval usage.
import { retrieve as scopedRetrieve } from '../retrieve.mjs';

/**
 * runALGO(ctx, step)
 * This is a minimal harness demonstrating how specialists can call retrieve().
 * It does not alter sandboxing or budgets.
 */
export async function runALGO(ctx = {}, step = {}) {
  const q = String(step.query || '');
  const useRetrieve = step.useRetrieve === true;
  let context = null;
  if (useRetrieve) {
    context = await scopedRetrieve(ctx, q, { maxTokens: step.maxTokens ?? null });
  }
  return { ok: true, context };
}

export default { runALGO };
