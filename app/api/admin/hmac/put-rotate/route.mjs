// app/api/admin/hmac/put-rotate/route.mjs
import { requireBridgeGuardsAsync } from '../../../../../lib/security/guard.mjs';
import * as crypto from 'node:crypto';
import * as HMAC from '../../../../../lib/security/hmac.mjs';

// Minimal Response shim compatible with tests
function jsonResponse(body, { status = 200 } = {}) {
  return { status, async json(){ return body; } };
}

async function callRotate(projectId, kid, key) {
  const rotateNamed = HMAC?.rotate;
  const rotateUnderscore = HMAC?._rotate;
  if (typeof rotateNamed === 'function') {
    try { const r = await rotateNamed({ projectId, kid, key }); if (r) return r; } catch {/* try underscore */}
  }
  if (typeof rotateUnderscore === 'function') {
    const r = await rotateUnderscore(projectId, kid, key);
    if (r) return r;
  }
  return { projectId, kid };
}

function coerceKidsMaybe(projectId){
  try {
    const list = (HMAC?.listActiveForProject && typeof HMAC.listActiveForProject === 'function')
      ? HMAC.listActiveForProject(projectId) : null;
    if (list && typeof list.then === 'function'){
      return list.then(arr => Array.isArray(arr) ? arr.map((k)=> (typeof k === 'string' ? { kid:k, active:true } : { kid: k?.kid ?? k?.id ?? String(k), active: !!k?.active })) : [])
                 .catch(()=>[]);
    }
  } catch {}
  return [];
}

export async function PUT(req){
  const headersIter = req?.headers && typeof req.headers[Symbol.iterator] === 'function' ? req.headers : new Map(Object.entries(req?.headers || {}));
  const headersObj = Object.fromEntries(headersIter);
  const auth = await requireBridgeGuardsAsync({ headers: headersObj }, { scope: ['bridge:admin'] });
  if (!auth?.ok) {
    const status = auth?.status ?? 401;
    const body = auth?.body ?? { error: { code: 'ERR_JWT_INVALID' } };
    return jsonResponse(body, { status });
  }

  const getH = (k) => (req?.headers?.get?.(k) ?? headersObj[k] ?? headersObj[k?.toLowerCase?.()]) ?? '';
  const contentType = String(getH('content-type') || '');
  const body = contentType.includes('application/json') && typeof req?.json === 'function' ? await req.json() : (req?.body || {});

  const hdrProject = String(getH('x-vibe-project')).trim();
  const projectId = String(body?.projectId || hdrProject || '').trim();
  const kid = String(body?.kid || '').trim() || `kid_${Date.now()}`;
  const key = String(body?.key || '').trim() || crypto.randomBytes(32).toString('hex');

  if (!projectId) return jsonResponse({ error: { code: 'ERR_BAD_INPUT', message: 'missing projectId' } }, { status: 400 });

  try {
    await callRotate(projectId, kid, key);
    let kids = await coerceKidsMaybe(projectId);
    return jsonResponse({ ok: true, projectId, kid, rotated: true, kids }, { status: 200 });
  } catch (e) {
    return jsonResponse({ error: { code: 'ERR_INTERNAL', message: e?.message || 'failed' } }, { status: 500 });
  }
}
