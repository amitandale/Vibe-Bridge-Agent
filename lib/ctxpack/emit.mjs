// lib/ctxpack/emit.mjs
import { createHash } from 'node:crypto';
import { buildPack } from './builder.mjs';
import { env } from '../util/env.mjs';

function sha256(s){ return createHash('sha256').update(Buffer.from(String(s))).digest('hex'); }
function normPath(p){ return String(p || '').replace(/\\/g, '/').replace(/^\.\//, ''); }

export function emitFromArtifacts({ projectId='unknown', pr, mode='PR', artifacts=[] }) {
  const sections = [
    { name:'templates', items: [] },
    { name:'spec_canvas', items: [] },
    { name:'diff_slices', items: [] },
    { name:'linked_tests', items: [] },
    { name:'contracts', items: [] },
    { name:'extras', items: [] }
  ];

  for (const a of artifacts) {
    const path = normPath(a.path || a.id || 'unknown');
    const item = { id: path, path, content: a.content ?? '', sha256: sha256(a.content ?? '') };
    // Simple heuristic routing
    if (/^tests\//.test(path)) sections.find(s=>s.name==='linked_tests').items.push(item);
    else if (/^lib\//.test(path)) sections.find(s=>s.name==='diff_slices').items.push(item);
    else sections.find(s=>s.name==='extras').items.push(item);
  }

  const provenance = [{
    source: env('CONTEXT_PROVIDER','fs'),
    generator: 'ba/ctxpack/emit',
    created_at: new Date().toISOString()
  }];

  return buildPack({ projectId, pr, mode, sections, provenance });
}

export async function emitFromContextProvider({ projectRoot=process.cwd(), projectId='unknown', pr, mode='PR' } = {}) {
  const { pack: legacyPack } = await import('../context/pack.mjs');
  const out = await legacyPack({ repoRoot: projectRoot, query: null, budget: {}, redact: async t => t });
  return emitFromArtifacts({ projectId, pr, mode, artifacts: out.artifacts || [] });
}
