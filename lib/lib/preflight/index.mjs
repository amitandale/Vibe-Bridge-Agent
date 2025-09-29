// lib/preflight/index.mjs
// Orchestrator stub for PR-1: compat + health only. No side effects.

import { verifyCompat } from './compat.mjs';
import { probeHealth } from './health.mjs';

/**
 * @typedef PreflightResult
 * @property {boolean} ok
 * @property {string[]} warnings
 * @property {{services: Array<{name: string, status: string}>}} details
 */

/**
 * Run preflight checks in warn-only mode by default.
 * @param {{ endpoints: object, matrix: object, fetch?: Function, timeoutMs?: number }} args
 * @returns {Promise<PreflightResult>}
 */
export async function runPreflightSkeleton(args = {}) {
  const warnings = [];
  const details = { services: [] };

  // Compat check
  const { warnings: cw = [] } = verifyCompat({ endpoints: args.endpoints, matrix: args.matrix });
  warnings.push(...cw);

  // Health probe per service
  const services = Array.isArray(args?.endpoints?.services) ? args.endpoints.services : [];
  for (const svc of services) {
    const url = svc?.health_url || svc?.url || '';
    if (!url) continue;
    let status = 'ok';
    try {
      status = await probeHealth(url, {
        timeoutMs: Number.isFinite(args.timeoutMs) ? args.timeoutMs : (Number(process.env.PREINVOKE_HEALTH_TIMEOUT_MS) || 2000),
        fetch: args.fetch,
        retries: 1,
      });
    } catch (e) {
      warnings.push(`HEALTH_UNAVAILABLE ${svc?.name || 'unknown'} ${e.message}`);
      status = 'unavailable';
    }
    details.services.push({ name: svc?.name || 'unknown', status });
  }

  return { ok: true, warnings, details };
}
