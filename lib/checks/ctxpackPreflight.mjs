// Preflight that can be wired behind an env flag. No behavior change unless invoked.
import { validateObject, ERR, CtxpackError } from '../ctxpack/index.mjs';

/**
 * @param {object} pack Context pack object
 * @param {'off'|'warn'|'enforce'} mode default 'warn'
 */
export function preflightCtxpack(pack, mode = process.env.CTXPACK_PREFLIGHT || 'warn') {
  if (mode === 'off') return { ok: true, warnings: ['preflight off'] };
  try {
    const res = validateObject(pack, { strictOrder: false });
    if (res.warnings?.length) {
      if (mode === 'enforce') {
        return { ok: false, code: 'WARNINGS_AS_ERRORS', warnings: res.warnings };
      }
      return { ok: true, warnings: res.warnings };
    }
    return { ok: true, warnings: [] };
  } catch (err) {
    if (err instanceof CtxpackError) {
      if (mode === 'enforce') {
        return { ok: false, code: err.code, message: err.message };
      }
      return { ok: true, warnings: [`${err.code}:${err.message}`] };
    }
    throw err;
  }
}
