import fs from 'node:fs/promises';
import { validateObject } from './validate.mjs';
import { assemble } from './assemble.mjs';

/**
 * Assemble and persist a manifest from a ContextPack with rollout controls.
 * Backward compatible: adds optional reportPath and merge_max_tokens without changing defaults.
 * @param {object} pack Validated ContextPack object
 * @param {{ model?:string, outPath?:string, mode?:'warn'|'enforce', onLog?:(e)=>void, reportPath?:string, merge_max_tokens?:number }} opts
 * @returns {Promise<object>} manifest
 */
export async function assembleAndPersist(
  pack,
  {
    model = 'gpt-xyz',
    outPath = 'assets/examples/ctxpack/manifest.latest.json',
    mode = 'warn',
    onLog,
    reportPath,
    merge_max_tokens
  } = {}
) {
  // Validate if possible; non-fatal in warn mode to allow budget error precedence
  try {
    validateObject(pack, { strictOrder: true });
  } catch (e) {
    if (mode === 'enforce') throw e;
    onLog?.({ level: 'warn', message: 'ctxpack schema validation failed; continuing for budget checks', meta: { code: e.code } });
  }

  try {
    // Preserve original assemble call shape to avoid breaking callers.
    const { manifest } = await assemble(pack, { model, merge_max_tokens });
    // Persist manifest
    await fs.writeFile(outPath, JSON.stringify(manifest, null, 2), 'utf8');
    // Optional JSON report for downstream scraping
    if (reportPath) {
      const report = {
        model,
        outPath,
        metrics: manifest?.metrics || null,
        evictions: manifest?.evictions || [],
        pointers: manifest?.pointers || [],
        hash: manifest?.hash,
        now_utc: new Date().toISOString(),
        ok: true,
        warnings: [],
        // explicit counters
        ctxpack_tokens_total: manifest?.metrics?.tokens_total ?? 0,
        ctxpack_files_total: manifest?.metrics?.files_total ?? 0,
        ctxpack_evictions_total: (manifest?.evictions || []).length,
        ctxpack_dedup_pointers_total: (manifest?.pointers || []).length,
      };
      await fs.mkdir(require('node:path').dirname(reportPath), { recursive: true }).catch(() => {});
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    }
    onLog?.({ level: 'info', message: 'ctxpack assembled', meta: { outPath, totals: manifest.totals ?? manifest.metrics } });
    return manifest;
  } catch (e) {
    if (e && e.code === 'BUDGET_ERROR') {
      onLog?.({ level: 'error', message: 'ctxpack assembly budget error', meta: { code: e.code } });
      throw e; // hard-fail on missing non-droppable
    }
    if (mode === 'enforce') {
      onLog?.({ level: 'error', message: 'ctxpack assembly failed in enforce mode', meta: { code: e.code } });
      throw e;
    }
    onLog?.({ level: 'warn', message: 'ctxpack assembly failed in warn mode; continuing', meta: { code: e.code } });
    return null;
  }
}

/**
 * Feature-flag helper for CI rollout.
 * Respects CTX_ASSEMBLE_ENABLED and CTX_ASSEMBLE_DRYRUN.
 * Returns a structured result and never throws.
 */
export async function maybeAssembleWithFlag(pack, opts = {}) {
  const enabled = String(process.env.CTX_ASSEMBLE_ENABLED || '').trim() === '1';
  const dry = String(process.env.CTX_ASSEMBLE_DRYRUN || '1').trim() === '1';
  const mode = enabled ? 'enforce' : 'warn';
  try {
    const manifest = await assembleAndPersist(pack, { ...opts, mode });
    return { ok: !!manifest, dry, manifest, skipped: false };
  } catch (e) {
    return { ok: false, dry, error: String(e?.message || e), skipped: false };
  }
}
