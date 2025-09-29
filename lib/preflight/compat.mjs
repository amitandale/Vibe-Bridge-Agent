// lib/preflight/compat.mjs
// Minimal compat matrix checker for BA-HOOK-02 PR-1.
function cmp(a, b){
  const pa = String(a).split('.').map(x=>parseInt(x,10)||0);
  const pb = String(b).split('.').map(x=>parseInt(x,10)||0);
  const n = Math.max(pa.length, pb.length);
  for (let i=0;i<n;i++){
    const da = pa[i]||0, db = pb[i]||0;
    if (da<db) return -1;
    if (da>db) return 1;
  }
  return 0;
}

export function verifyCompat({ endpoints, matrix }){
  if (!endpoints || typeof endpoints !== 'object') throw makeErr('SCHEMA_INCOMPATIBLE', 'endpoints missing', { service: 'all' });
  const services = endpoints.services || {};
  const minVersions = (matrix && (matrix.minVersions||matrix.minimums)) || {};
  const result = {};
  for (const [name, svc] of Object.entries(services)){
    const schema = svc?.schema_version;
    if (schema !== 'mcp.v1'){
      throw makeErr('SCHEMA_INCOMPATIBLE', `Unknown schema_version ${schema}`, { service: name, have: schema, need: 'mcp.v1' });
    }
    const have = String(svc?.version||'0.0.0');
    const need = String(minVersions[name] || '0.0.0');
    if (cmp(have, need) < 0){
      throw makeErr('SCHEMA_INCOMPATIBLE', `Version too low for ${name}: have ${have}, need ${need}`, { service: name, have, need });
    }
    result[name] = { ok: true, have, need };
  }
  return { ok: true, details: result };
}

function makeErr(code, message, details){
  const e = new Error(message || code);
  e.name = 'PreflightError';
  e.code = code;
  e.details = details;
  return e;
}
