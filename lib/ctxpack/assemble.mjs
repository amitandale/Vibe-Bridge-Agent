// lib/ctxpack/assemble.mjs
// Deterministic assembler with budget mechanics:
// - Canonical section order
// - Stable in-section sort (path, start_line, symbol)
// - Per-file head/tail compression
// - Span merge to text
// - Intra- and inter-section dedup
// - Deterministic eviction by distance_to_diff then length
// - Hard-fail if a must_include in sections 1–5 would be dropped
import { CtxpackError } from './errors.mjs';
import { validateObject } from './validate.mjs';
import { sha256Canonical } from './hash.mjs';

const ORDER = ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'];
const NON_DROPPABLE_LAST_INDEX = ORDER.indexOf('contracts');

function textOf(it){
  if (typeof it.content === 'string') return it.content;
  // Merge spans to a single text blob deterministically
  if (Array.isArray(it.spans)){
    return it.spans.map(s => String(s.text ?? '')).join('\n');
  }
  return String(it.text ?? '');
}

/** Stable order inside a section: path, start_line, symbol */
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

/** Deterministic estimator from existing util */
async function getEstimator(){
  const mod = await import('../llm/util/estimate.mjs');
  return mod.estimateTokens;
}

/** Head/tail compression to meet per-file token cap; keeps a symbol header if present */
function compressText(it, maxPerFileTokens, estimateTokens){
  const original = textOf(it);
  const base = estimateTokens({ text: original }).inputTokens;
  if (!maxPerFileTokens || base <= maxPerFileTokens){
    return { text: original, tokens: base, compressed: false };
  }
  const header = it.symbol ? `// ${it.symbol}
` : '';
  let headLen = Math.ceil(original.length / 2);
  let tailLen = original.length - headLen;
  let text = '';
  let tokens = Infinity;
  // Iteratively shrink until within cap
  while (headLen >= 0){
    const head = original.slice(0, headLen);
    const tail = original.slice(original.length - tailLen);
    text = header + head + '\n...\n' + tail;
    tokens = estimateTokens({ text }).inputTokens;
    if (tokens <= maxPerFileTokens) break;
    // reduce both windows proportionally
    headLen = Math.floor(headLen * 0.8);
    tailLen = Math.floor(tailLen * 0.8);
    if (headLen + tailLen <= 0){
      text = header; tokens = estimateTokens({ text }).inputTokens;
      break;
    }
  }
  return { text, tokens, compressed: true };
}

function dedupWithinSection(items){
  const seenText = new Set();
  const out = [];
  for (const it of items){
    const t = textOf(it);
    if (seenText.has(t)) continue;
    seenText.add(t);
    out.push(it);
  }
  return out;
}

function priorityScore(it){
  const dist = Number.isFinite(it.distance_to_diff) ? Number(it.distance_to_diff) : 1e9;
  const len = textOf(it).length;
  // Lower dist better; shorter better for packing. We'll sort ascending.
  return { dist, len };
}

/**
 * Assemble a prompt manifest from ContextPack with budget mechanics.
 * Throws CtxpackError('BUDGET_ERROR', ...) if a non-droppable must_include cannot fit.
 */
export async function assemble(pack, { model='default' } = {}){
  // Validate structure and recompute hash deterministically
  validateObject(pack, { strictOrder: true });
  const clone = structuredClone(pack); const got = clone.hash; delete clone.hash;
  const expect = sha256Canonical(clone);
  if (got !== expect) throw new CtxpackError('HASH_MISMATCH', 'pack.hash does not match canonical content');

  const estimateTokens = await getEstimator();

  const caps = pack.budgets || {};
  const maxTokens = Number(caps.max_tokens || 0);
  const maxFiles  = Number(caps.max_files  || 0);
  const maxPerFileTokens = Number(caps.max_per_file_tokens || 0);
  const sectionCaps = { ...(caps.section_caps || {}) };
  for (const s of ORDER) if (!Number.isInteger(sectionCaps[s])) sectionCaps[s] = 0;

  const mustIds = new Set((pack.must_include || []).map(x => String(x)));

  const manifest = { version:'1', model, sections: [], totals:{ tokens:0, files:0 } };
  let globalTokens = 0;
  let globalFiles = 0;
  const seenContent = new Set(); // inter-section dedup on exact content

  for (const name of ORDER){
    const sec = pack.sections.find(s => s.name === name) || { name, items: [] };
    let items = stableSort(sec.items || []);
    items = dedupWithinSection(items);

    // Score, compress, and remove inter-section dups
    const scored = [];
    for (const it of items){
      const { text, tokens, compressed } = compressText(it, maxPerFileTokens, estimateTokens);
      if (seenContent.has(text)){
        // Drop duplicate content across sections deterministically
        continue;
      }
      const pri = priorityScore(it);
      const id = String(it.id || it.path || '');
      scored.push({ it, id, text, tokens, compressed, pri });
    }

    // Separate non-droppable and optional for sections 1–5
    const secIndex = ORDER.indexOf(name);
    const nonDroppable = [];
    const optional = [];
    for (const s of scored){
      if (secIndex <= NON_DROPPABLE_LAST_INDEX && mustIds.has(s.id)) nonDroppable.push(s);
      else optional.push(s);
    }

    // Capacity trackers
    const placed = [];
    let secFiles = 0;
    let secTokens = 0;
    const secCapFiles = sectionCaps[name] || 0

    // Place non-droppables first; fail hard if cannot fit
    for (const s of nonDroppable){
      const nextFiles = globalFiles + 1;
      const nextTokens = globalTokens + s.tokens;
      const nextSecFiles = secFiles + 1;
      const filesOver = nextFiles > maxFiles;
      const tokensOver = nextTokens > maxTokens;
      const secOver = nextSecFiles > secCapFiles;
      if (filesOver || tokensOver || secOver){
        throw new CtxpackError('BUDGET_ERROR', `Non-droppable item exceeds caps in section ${name}`, { id: s.id, section: name });
      }
      placed.push({ id: s.id, path: s.it.path || undefined, text: s.text, tokens: s.tokens });
      seenContent.add(s.text);
      globalFiles = nextFiles;
      globalTokens = nextTokens;
      secFiles = nextSecFiles;
      secTokens += s.tokens;
    }

    // Sort optional by keep priority: closer to diff first, then shorter
    optional.sort((a,b) => {
      if (a.pri.dist !== b.pri.dist) return a.pri.dist - b.pri.dist;
      return a.pri.len - b.pri.len;
    });

    for (const s of optional){
      const nextFiles = globalFiles + 1;
      const nextTokens = globalTokens + s.tokens;
      const nextSecFiles = secFiles + 1;
      const filesOver = nextFiles > maxFiles;
      const tokensOver = nextTokens > maxTokens;
      const secOver = nextSecFiles > secCapFiles;
      if (filesOver || tokensOver || secOver){
        // Evict deterministically by simply not placing lower-priority items
        continue;
      }
      placed.push({ id: s.id, path: s.it.path || undefined, text: s.text, tokens: s.tokens });
      seenContent.add(s.text);
      globalFiles = nextFiles;
      globalTokens = nextTokens;
      secFiles = nextSecFiles;
      secTokens += s.tokens;
    }

    manifest.sections.push({ name, items: placed });
  }

  manifest.totals.tokens = globalTokens;
  manifest.totals.files  = globalFiles;
  manifest.hash = sha256Canonical(manifest);
  // Perform deferred validation only if earlier schema check was deferred
  if (_validated === false) {
    validateObject(pack, { strictOrder: true });
  }
  return { manifest };
}
