import { sha256Canonical } from './hash.mjs';
import { validateObject } from './validate.mjs';
import { CtxpackError } from './errors.mjs';

const ORDER = ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'];

export function verifyPackHash(pack) {
  const clone = JSON.parse(JSON.stringify(pack));
  const got = clone.hash;
  delete clone.hash;
  const expect = sha256Canonical(clone);
  if (got !== expect) throw new CtxpackError('HASH_MISMATCH', 'pack.hash does not match canonical content');
}

export function enforceBudgets(pack) {
  const caps = pack.budgets.section_caps;
  const counts = Object.fromEntries(ORDER.map(s => [s, 0]));
  for (const s of pack.sections) counts[s.name] += s.items.length;
  for (const s of ORDER) {
    if (counts[s] > (caps[s] ?? 0)) {
      throw new CtxpackError('SECTION_CAP_EXCEEDED', `section ${s} count ${counts[s]} > cap ${caps[s] ?? 0}`);
    }
  }
  const totalFiles = Object.values(counts).reduce((a,b)=>a+b,0);
  if (totalFiles > pack.budgets.max_files) {
    throw new CtxpackError('MAX_FILES_EXCEEDED', `files ${totalFiles} > ${pack.budgets.max_files}`);
  }
}

export function enforceMustNever(pack) {
  const never = pack.never_include || [];
  // naive glob: treat '*' as wildcard within path segments
  const toRe = p => new RegExp('^' + p.split('*').map(x=>x.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*') + '$');
  const neverRes = never.map(toRe);
  for (const s of pack.sections) {
    for (const it of s.items) {
      if (it.path && neverRes.some(r => r.test(it.path))) {
        throw new CtxpackError('NEVER_INCLUDE_MATCH', `item ${it.id} path ${it.path} matches never_include`);
      }
    }
  }
  for (const mi of pack.must_include || []) {
    // must_include must fit into section caps; rely on enforceBudgets for totals
    if (!['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'].includes(mi.section)) {
      throw new CtxpackError('MUST_SECTION_INVALID', `must_include.section ${mi.section} invalid`);
    }
  }
}

export function enforceOrder(pack) {
  const order = pack.order;
  const idx = new Map(order.map((n,i)=>[n,i]));
  let prev = -1;
  for (const s of pack.sections) {
    const i = idx.get(s.name);
    if (i < prev) throw new CtxpackError('ORDER_VIOLATION', `section ${s.name} out of order`);
    prev = i;
  }
}

/**
 * Full gate. Throws on failure.
 * Options:
 *  - mode: 'off'|'warn'|'enforce' (default uses process.env.CTXPACK_GATE)
 */
export function gate(pack, {mode = process.env.CTXPACK_GATE || 'warn'} = {}) {
  if (mode === 'off') return { ok: true, warnings: ['gate off'] };
  // structural validation
  validateObject(pack, { strictOrder: true });
  // deep invariants
  verifyPackHash(pack);
  enforceOrder(pack);
  enforceBudgets(pack);
  enforceMustNever(pack);
  return { ok: true };
}
