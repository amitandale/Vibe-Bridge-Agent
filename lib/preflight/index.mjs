// lib/preflight/index.mjs
// Orchestrator stub for PR-1: compat + health only. No side effects.

import { verifyCompat } from './compat.mjs';
import { probeHealth } from './health.mjs';

/**
 * @typedef PreflightResult
 * @property {boolean} ok
 * @property {string[]} warnings
 * @property {object} details
 */

/**
 * Run preflight checks in warn-only mode by default.
 * @param {{ endpoints: object, matrix: object, fetch?: Function, timeoutMs?: number }} args
 * @returns {Promise<PreflightResult>}
 */
export async function runPreflightSkeleton(args = {}) {
  const warnings = [];
  const details = { services: [] };
  // Compat
  const compat = verifyCompat({ endpoints: args.endpoints, matrix: args.matrix });
  warnings.push(...(compat.warnings || []));

  // Health for each service
  const services = Array.isArray(args?.endpoints?.services) ? args.endpoints.services : [];
  for (const svc of services) {
    const url = svc?.health_url || svc?.url || '';
    if (!url) continue;
    let status = 'ok';
    try {
      status = await probeHealth(url, { timeoutMs: args.timeoutMs, fetch: args.fetch, retries: 1 });
    } catch (e) {
      warnings.push(`HEALTH_UNAVAILABLE ${svc?.name || 'unknown'} ${e.message}`);
      status = 'unavailable';
    }
    details.services.push({ name: svc?.name, status });
  }

  return { ok: true, warnings, details };
}
