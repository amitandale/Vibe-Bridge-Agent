// lib/preflight/compat.mjs
// Verify endpoints manifest against required schema/version.
// Throws SCHEMA_INCOMPATIBLE on violation.

/**
 * Compare dotted versions like "1.2.3" numerically.
 * Returns -1, 0, 1.
 */
function cmpVer(a = '0', b = '0') {
  const A = String(a).split('.').map(x => parseInt(x, 10) || 0);
  const B = String(b).split('.').map(x => parseInt(x, 10) || 0);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const ai = A[i] ?? 0;
    const bi = B[i] ?? 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

function makeErr(code, message, data) {
  const e = new Error(`${code} ${message}`);
  e.name = 'PreflightError';
  e.code = code;
  if (data) e.data = data;
  return e;
}

/**
 * @param {{ endpoints: {services?: Array<any>}, matrix: Record<string, {min?: string}|string> }} param0
 * @returns {{warnings: string[]}}
 */
export function verifyCompat({ endpoints, matrix }) {
  if (!endpoints || typeof endpoints !== 'object') {
    throw makeErr('ENDPOINTS_MISSING', 'No endpoints manifest provided', {});
  }
  const warnings = [];
  const services = Array.isArray(endpoints.services) ? endpoints.services : [];
  for (const svc of services) {
    const name = svc?.name || 'unknown';
    const schema = svc?.schema_version;
    if (schema !== 'mcp.v1') {
      throw makeErr('SCHEMA_INCOMPATIBLE', `Unknown schema_version ${String(schema)}`, {
        service: name, have: schema, need: 'mcp.v1'
      });
    }
    const req = matrix?.[name];
    const min = typeof req === 'string' ? req : (req && req.min);
    if (min && cmpVer(svc?.version, min) < 0) {
      throw makeErr('SCHEMA_INCOMPATIBLE', `Version too low for ${name}`, {
        service: name, have: String(svc?.version ?? ''), need: String(min)
      });
    }
  }
  return { warnings };
}
