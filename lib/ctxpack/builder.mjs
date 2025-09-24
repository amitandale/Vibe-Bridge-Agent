// lib/ctxpack/builder.mjs
import { sha256Canonical } from './hash.mjs';

/**
 * Build a ContextPack v1.0.0 from inputs.
 * Caller supplies sections and lists as needed. This function fills defaults and computes hash.
 */
export function buildPack({ projectId, pr, mode = 'PR', order, budgets, sections = [], must_include = [], nice_to_have = [], never_include = [], provenance = [] }) {
  const ORDER = ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'];
  const pack = {
    version: '1.0.0',
    project: { id: projectId || 'unknown' },
    pr: {
      id: pr?.id || 'unknown',
      branch: pr?.branch || process.env.GIT_BRANCH || 'work',
      commit_sha: pr?.commit_sha || process.env.GIT_COMMIT || 'deadbee',
    },
    mode,
    order: order && order.length ? order.slice() : ORDER.slice(),
    budgets: Object.assign({
      max_tokens: 20000,
      max_files: 200,
      max_per_file_tokens: 8000,
      section_caps: { templates:5, spec_canvas:2, diff_slices:80, linked_tests:20, contracts:10, extras:20 }
    }, budgets || {}),
    sections: sections.map(s => ({ name: s.name, items: (s.items||[]).map(it => ({ ...it })) })),
    must_include: must_include.slice(),
    nice_to_have: nice_to_have.slice(),
    never_include: never_include.slice(),
    provenance: provenance.slice()
  };
  // compute hash over canonical bytes without hash field
  const clone = JSON.parse(JSON.stringify(pack));
  const h = sha256Canonical(clone);
  pack.hash = h;
  return pack;
}
