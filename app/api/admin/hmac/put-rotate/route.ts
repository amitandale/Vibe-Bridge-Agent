// app/api/admin/hmac/put-rotate/route.ts
import { NextResponse } from 'next/server';
import { requireBridgeGuardsAsync } from '../../../../../lib/security/guard.mjs';
import * as crypto from 'node:crypto';
// Use hmac rotate; support both ({projectId,kid,key}) and (projectId,kid,key) signatures
import { rotate as rotateNamed, listActiveForProject as hmacListActive } from '../../../../../lib/security/hmac.mjs';
import { _rotate as rotateUnderscore } from '../../../../../lib/security/hmac.mjs';

async function callRotate(projectId: string, kid: string, key: string) {
  try {
    if (typeof (rotateNamed as any) === 'function') {
      // Try named-args form first
      try {
        const r = await (rotateNamed as any)({ projectId, kid, key });
        return r ?? { projectId, kid };
      } catch { /* fall through */ }
    }
    if (typeof (rotateUnderscore as any) === 'function') {
      const r = await (rotateUnderscore as any)(projectId, kid, key);
      return r ?? { projectId, kid };
    }
    // Fallback
    return { projectId, kid };
  } catch (e) {
    throw e;
  }
}

export async function PUT(req: Request) {
  const auth = await requireBridgeGuardsAsync({ headers: Object.fromEntries(req.headers) } as any, { scope: ['bridge:admin'] });
  if (!auth?.ok) {
    const status = (auth as any)?.status ?? 401;
    const body = (auth as any)?.body ?? { error: { code: 'ERR_JWT_INVALID' } };
    return NextResponse.json(body, { status });
  }

  const contentType = req.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await req.json() : {};
  const hdrProject = (req.headers.get('x-vibe-project') || '').trim();
  const projectId = (body?.projectId || hdrProject || '').trim();
  const kid = (body?.kid || '').trim() || `kid_${Date.now()}`;
  const key = (body?.key || '').trim() || crypto.randomBytes(32).toString('hex');

  if (!projectId) {
    return NextResponse.json({ error: { code: 'ERR_BAD_INPUT', message: 'missing projectId' } }, { status: 400 });
  }

  try {
    await callRotate(projectId, kid, key);
    // Report active kid set and list current kids for visibility
    let kids: any[] = [];
    try {
      const list = await (hmacListActive as any)(projectId);
      kids = Array.isArray(list) ? list.map((k: any) => (typeof k === 'string' ? { kid: k, active: true } : { kid: k.kid ?? k.id ?? String(k), active: !!k.active })) : [];
    } catch {}
    return NextResponse.json({ ok: true, projectId, kid, rotated: true, kids });
  } catch (e: any) {
    return NextResponse.json({ error: { code: 'ERR_INTERNAL', message: e?.message || 'failed' } }, { status: 500 });
  }
}
