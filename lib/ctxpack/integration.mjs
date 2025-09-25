// lib/ctxpack/integration.mjs
import fs from 'node:fs/promises';
import { validateObject } from './validate.mjs';
import { assemble } from './assemble.mjs';

/**
 * Assemble and persist a manifest from a ContextPack with rollout controls.
 * @param {object} pack Validated ContextPack object
 * @param {{ model?:string, outPath?:string, mode?:'warn'|'enforce', onLog?:(e)=>void }} opts
 * @returns {Promise<object>} manifest
 */
export async function assembleAndPersist(pack, { model='gpt-xyz', outPath='assets/examples/ctxpack/manifest.latest.json', mode='warn', onLog } = {}) {
  // Validate if possible; non-fatal in warn mode to allow budget error precedence
  try { validateObject(pack, { strictOrder: true }); } catch (e) {
    if (mode === 'enforce') throw e;
    onLog?.({ level:'warn', message:'ctxpack schema validation failed; continuing for budget checks', meta:{ code:e.code } });
  }
  try {
    const { manifest } = await assemble(pack, { model });
    await fs.writeFile(outPath, JSON.stringify(manifest, null, 2), 'utf8');
    onLog?.({ level:'info', message:'ctxpack assembled', meta:{ outPath, totals:manifest.totals } });
    return manifest;
  } catch (e) {
    if (e && e.code === 'BUDGET_ERROR') {
      onLog?.({ level:'error', message:'ctxpack assembly budget error', meta:{ code:e.code } });
      throw e; // hard-fail on missing non-droppable
    }
    if (mode === 'enforce') {
      onLog?.({ level:'error', message:'ctxpack assembly failed in enforce mode', meta:{ code:e.code } });
      throw e;
    }
    onLog?.({ level:'warn', message:'ctxpack assembly failed in warn mode; continuing', meta:{ code:e.code } });
    return null;
  }
}
