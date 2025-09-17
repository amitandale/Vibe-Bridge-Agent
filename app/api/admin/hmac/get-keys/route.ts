// app/api/admin/hmac/get-keys/route.ts
import { NextResponse } from 'next/server';
import { requireBridgeGuardsAsync } from '../../../../../lib/security/guard.mjs';
// Prefer going through hmac provider since BA-02 remains file-backed
import { listActiveForProject as hmacListActive } from '../../../../../lib/security/hmac.mjs';

export async function GET(req: Request) {
  // Admin auth
  const auth = await requireBridgeGuardsAsync({ headers: Object.fromEntries(req.headers) } as any, { scope: ['bridge:admin'] });
  if (!auth?.ok) {
    const status = (auth as any)?.status ?? 401;
    const body = (auth as any)?.body ?? { error: { code: 'ERR_JWT_INVALID' } };
    return NextResponse.json(body, { status });
  }

  const projectId = (req.headers.get('x-vibe-project') || '').trim();
  if (!projectId) {
    return NextResponse.json({ error: { code: 'ERR_BAD_INPUT', message: 'missing x-vibe-project' } }, { status: 400 });
  }

  try {
    const list = await (hmacListActive as any)(projectId);
    const kids = Array.isArray(list)
      ? list.map((k: any) => (typeof k === 'string' ? { kid: k, active: true } : { kid: k.kid ?? k.id ?? String(k), active: !!k.active }))
      : [];
    return NextResponse.json({ ok: true, projectId, kids });
  } catch (e: any) {
    return NextResponse.json({ error: { code: 'ERR_INTERNAL', message: e?.message || 'failed' } }, { status: 500 });
  }
}
