import { CtxpackError, ERR } from './errors.mjs';
import fs from 'node:fs/promises';

/**
 * Minimal validator per ANN-00:
 * - version === 1
 * - meta has project, branch, commit, generatedAt
 * - sections array. Known names only.
 * - section.items array of objects with id and optional content/path/meta/sha256
 * - fixed global order (ANN-00 warns only): templates → spec_canvas → diff_slices → linked_tests → contracts → extras
 */
const ORDER = ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'];

export function validateObject(pack, {strictOrder=false} = {}) {
  if (!pack || typeof pack !== 'object') throw new CtxpackError(ERR.SCHEMA_INVALID, 'pack must be an object');
  if (pack.version !== 1) throw new CtxpackError(ERR.SCHEMA_INVALID, 'version must equal 1');

  const m = pack.meta ?? {};
  for (const k of ['project','branch','commit','generatedAt']) {
    if (!m[k] || typeof m[k] !== 'string') {
      throw new CtxpackError(ERR.MISSING_REQUIRED, `meta.${k} required`);
    }
  }
  if (!Array.isArray(pack.sections)) throw new CtxpackError(ERR.SCHEMA_INVALID, 'sections must be array');

  const names = [];
  for (const s of pack.sections) {
    if (!s || typeof s !== 'object') throw new CtxpackError(ERR.SCHEMA_INVALID, 'section must be object');
    if (!ORDER.includes(s.name)) throw new CtxpackError(ERR.SCHEMA_INVALID, `unknown section.name=${s.name}`);
    names.push(s.name);
    if (!Array.isArray(s.items)) throw new CtxpackError(ERR.SCHEMA_INVALID, 'section.items must be array');
    for (const it of s.items) {
      if (!it || typeof it !== 'object') throw new CtxpackError(ERR.SCHEMA_INVALID, 'item must be object');
      if (!it.id || typeof it.id !== 'string') throw new CtxpackError(ERR.MISSING_REQUIRED, 'item.id required');
    }
  }

  // Enforce or warn about order
  const orderIdx = names.map(n => ORDER.indexOf(n)).filter(i => i >= 0);
  const sorted = [...orderIdx].sort((a,b)=>a-b);
  const isOrdered = orderIdx.length === sorted.length && orderIdx.every((v,i)=>v===sorted[i]);
  if (strictOrder && !isOrdered) {
    throw new CtxpackError(ERR.INVALID_ORDER, `sections out of order: got [${names.join(', ')}]`);
  }
  return { ok: true, warnings: isOrdered ? [] : ['sections not in canonical order'] };
}

export async function validateFile(filepath, opts) {
  const raw = await fs.readFile(filepath, 'utf8');
  const pack = JSON.parse(raw);
  return validateObject(pack, opts);
}
