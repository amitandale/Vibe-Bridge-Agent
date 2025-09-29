// lib/preflight/index.mjs
// Orchestrator stub: load endpoints, compat check, health probes. No side effects.
import { verifyCompat } from './compat.mjs';
import { probeHealth } from './health.mjs';

/**
 * runPreflight skeleton.
 * @param {object} opts
 *  - endpoints: manifest object { services: { name: { url, schema_version, version } } }
 *  - compatMatrix: { minVersions: { [name]: 'x.y.z' } }
 *  - enforce: boolean (warn-only when false)
 *  - timeoutMs: number
 */
export async function runPreflight({ endpoints, compatMatrix, enforce = false, timeoutMs } = {}){
  const warnings = [];
  const details = { services: {} };

  // compat gate
  try {
    verifyCompat({ endpoints, matrix: compatMatrix });
  } catch (e){
    if (enforce) return { ok: false, warnings, details, error: toErr(e) };
    warnings.push({ code: e.code || 'SCHEMA_INCOMPATIBLE', message: e.message, details: e.details });
    return { ok: true, warnings, details };
  }

  // health probes
  const services = endpoints?.services || {};
  for (const [name, svc] of Object.entries(services)){
    try {
      const r = await probeHealth(svc.url, { timeoutMs });
      details.services[name] = r;
      if (r.status === 'degraded'){
        warnings.push({ code: 'HEALTH_DEGRADED', service: name });
      }
    } catch (e){
      if (enforce) return { ok: false, warnings, details, error: toErr(e) };
      warnings.push({ code: e.code || 'HEALTH_UNAVAILABLE', service: name, details: e.details });
    }
  }

  return { ok: warnings.length === 0, warnings, details };
}

function toErr(e){
  return { code: e?.code || 'ERROR', message: String(e?.message||e), details: e?.details };
}
