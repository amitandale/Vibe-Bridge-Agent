// app/api/admin/hmac/get-keys/route.mjs
import { NextResponse } from 'next/server';
import { requireBridgeGuardsAsync } from '../../../../../lib/security/guard.mjs';
import { listActiveForProject as hmacListActive } from '../../../../../lib/security/hmac.mjs';

export async function GET(req){
  // Admin auth
  const headersObj = Object.fromEntries(req?.headers ?? []);
  const auth = await requireBridgeGuardsAsync({ headers: headersObj }, { scope: ['bridge:admin'] });
  if (!auth?.ok) {
    const status = auth?.status ?? 401;
    const body = auth?.body ?? { error: { code: 'ERR_JWT_INVALID' } };
    return NextResponse.json(body, { status });
  }

  const projectId = String((req?.headers?.get?.('x-vibe-project') ?? '')).trim();
  if (!projectId) {
    return NextResponse.json({ error: { code: 'ERR_BAD_INPUT', message: 'missing x-vibe-project' } }, { status: 400 });
  }

  try {
    const list = await hmacListActive(projectId);
    const kids = Array.isArray(list)
      ? list.map((k) => (typeof k === 'string' ? { kid: k, active: true } : { kid: k.kid ?? k.id ?? String(k), active: !!k.active }))
      : [];
    return NextResponse.json({ ok: true, projectId, kids });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ERR_INTERNAL', message: e?.message || 'failed' } }, { status: 500 });
  }
}
