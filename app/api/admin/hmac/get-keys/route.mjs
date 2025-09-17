// app/api/admin/hmac/get-keys/route.mjs
import { requireBridgeGuardsAsync } from '../../../../../lib/security/guard.mjs';
import { listActiveForProject as hmacListActive } from '../../../../../lib/security/hmac.mjs';

// Minimal Response shim compatible with tests
function jsonResponse(body, { status = 200 } = {}) {
  return { status, async json(){ return body; } };
}

export async function GET(req){
  // Admin auth
  const headersIter = req?.headers && typeof req.headers[Symbol.iterator] === 'function' ? req.headers : new Map(Object.entries(req?.headers || {}));
  const headersObj = Object.fromEntries(headersIter);
  const auth = await requireBridgeGuardsAsync({ headers: headersObj }, { scope: ['bridge:admin'] });
  if (!auth?.ok) {
    const status = auth?.status ?? 401;
    const body = auth?.body ?? { error: { code: 'ERR_JWT_INVALID' } };
    return jsonResponse(body, { status });
  }

  const getH = (k) => (req?.headers?.get?.(k) ?? headersObj[k] ?? headersObj[k?.toLowerCase?.()]) ?? '';
  const projectId = String(getH('x-vibe-project')).trim();
  if (!projectId) {
    return jsonResponse({ error: { code: 'ERR_BAD_INPUT', message: 'missing x-vibe-project' } }, { status: 400 });
  }

  try {
    const list = await hmacListActive(projectId);
    const kids = Array.isArray(list)
      ? list.map((k) => (typeof k === 'string' ? { kid: k, active: true } : { kid: k.kid ?? k.id ?? String(k), active: !!k.active }))
      : [];
    return jsonResponse({ ok: true, projectId, kids }, { status: 200 });
  } catch (e) {
    return jsonResponse({ error: { code: 'ERR_INTERNAL', message: e?.message || 'failed' } }, { status: 500 });
  }
}
