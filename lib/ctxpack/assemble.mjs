// lib/ctxpack/assemble.mjs
// Deterministic assembler: ContextPack v1 -> ordered, budget-constrained manifest
import { CtxpackError } from './errors.mjs';
import { validateObject } from './validate.mjs';
import { sha256Canonical } from './hash.mjs';

const ORDER = ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'];

/** Load deterministic token estimator */
function getEstimator(){
  return import('../llm/util/estimate.mjs').then(m => m.estimateTokens);
}
const MODEL_FACTORS = Object.freeze({ default: 1 });

function stableSort(items){
  return [...items].sort((a,b) => {
    const pa = String(a.path || a.id || ''), pb = String(b.path || b.id || '');
    if (pa !== pb) return pa < pb ? -1 : 1;
    const sa = Number(a.loc?.start_line || 0), sb = Number(b.loc?.start_line || 0);
    if (sa !== sb) return sa - sb;
    const ya = String(a.symbol || ''), yb = String(b.symbol || '');
    if (ya < yb) return -1;
    if (ya > yb) return 1;
    return 0;
  });
}

function textOf(it){
  if (typeof it.content === 'string') return it.content;
  if (Array.isArray(it.spans)) return it.spans.map(s => String(s.text || '')).join('\n');
  return String(it.text || '');
}

/**
 * Assemble a prompt manifest from a validated ContextPack.
 * Guarantees: canonical section order, stable in-section sort, global + per-section caps respected,
 * deterministic output, and a hash on the manifest.
 * No compression/eviction heuristics beyond hard caps for this core overlay.
 */
export async function assemble(pack, { model='default' } = {}){
  // Structural validation
  validateObject(pack, { strictOrder: true });
  // Verify pack hash deterministically
  const clone = structuredClone(pack); const got = clone.hash; delete clone.hash;
  const expect = sha256Canonical(clone);
  if (got !== expect) throw new CtxpackError('HASH_MISMATCH', 'pack.hash does not match canonical content');

  const estimateTokens = await getEstimator();
  const factor = MODEL_FACTORS[model] || MODEL_FACTORS.default;

  const caps = pack.budgets || {};
  const maxTokens = Number(caps.max_tokens || 0);
  const maxFiles  = Number(caps.max_files  || 0);
  const sectionCaps = { ...(caps.section_caps || {}) };
  for (const s of ORDER) if (!Number.isInteger(sectionCaps[s])) sectionCaps[s] = 0;

  const manifest = { version:'1', model, sections: [], totals:{ tokens:0, files:0 } };

  let globalTokens = 0;
  let globalFiles = 0;

  for (const name of ORDER){
    const sec = pack.sections.find(s => s.name === name) || { name, items: [] };
    const items = stableSort(sec.items || []);

    const placed = [];
    let secFiles = 0;
    let secTokens = 0;

    const capFiles = sectionCaps[name];

    for (const it of items){
      const id = String(it.id || it.path || '');
      const t = estimateTokens({ text: textOf(it) }).inputTokens * factor;

      const nextFiles  = globalFiles + 1;
      const nextTokens = globalTokens + t;
      const nextSecFiles = secFiles + 1;

      const filesOver = maxFiles  ? nextFiles  > maxFiles  : false;
      const tokensOver= maxTokens ? nextTokens > maxTokens : false;
      const secOver   = capFiles  ? nextSecFiles > capFiles : false;

      if (filesOver || tokensOver || secOver){
        // Core overlay: do not evict requireds or compress. Stop filling this section.
        break;
      }

      placed.push({ id, path: it.path || undefined, tokens: t });
      globalFiles = nextFiles;
      globalTokens = nextTokens;
      secFiles = nextSecFiles;
      secTokens += t;
    }

    manifest.sections.push({ name, items: placed });
  }

  manifest.totals.tokens = globalTokens;
  manifest.totals.files  = globalFiles;
  manifest.hash = sha256Canonical(manifest);
  return { manifest };
}
