// lib/planner/index.mjs
import { buildPack } from '../ctxpack/builder.mjs';
import { planFromSignals } from './logic.mjs';

/**
 * High-level API.
 * @param {object} inputs  { projectId, pr:{id,branch,commit_sha}, mode, labels[], diff, failingTests[], templatesRegistry?, fileContents? }
 * @returns {object} ContextPack v1.0.0
 */
export function planPR(inputs) {
  const plan = planFromSignals(inputs);
  const { sections, must_include, nice_to_have, provenance, budgets, order, never_include } = plan;
  return buildPack({
    projectId: inputs.projectId || 'unknown',
    pr: inputs.pr,
    mode: inputs.mode || 'PR',
    order,
    budgets,
    sections,
    must_include,
    nice_to_have,
    never_include: never_include || [],
    provenance
  });
}

export { planFromSignals } from './logic.mjs';
