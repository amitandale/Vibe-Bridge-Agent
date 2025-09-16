/**
 * Team-Leader orchestrator.
 * Wires plan execution to the executor with a selectable retriever.
 * No PR identifiers in code.
 */
import { execute } from '../exec/executor.mjs';
import { selectRetriever } from '../context/retrievers/select.mjs';

export async function runPlan(ctx = {}, plan = {}, opts = {}) {
  const retrieve =
    typeof opts.retrieve === 'function'
      ? opts.retrieve
      : selectRetriever({ prefer: opts.prefer, env: opts.env, heuristics: opts.heuristics });

  return execute({ plan, ctx, retrieve });
}
