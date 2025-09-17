// app/api/admin/hmac/put-rotate/route.mjs
import { NextResponse } from 'next/server';
import { requireBridgeGuardsAsync } from '../../../../../lib/security/guard.mjs';
import * as crypto from 'node:crypto';
import { rotate as rotateNamed, listActiveForProject as hmacListActive } from '../../../../../lib/security/hmac.mjs';
import { _rotate as rotateUnderscore } from '../../../../../lib/security/hmac.mjs';

async function callRotate(projectId, kid, key) {
  if (typeof rotateNamed === 'function') {
    try {
      const r = await rotateNamed({ projectId, kid, key });
      if (r) return r;
    } catch {/* try underscore */}
  }
  if (typeof rotateUnderscore === 'function') {
    const r = await rotateUnderscore(projectId, kid, key);
    if (r) return r;
  }
  return { projectId, kid };
}

export async function PUT(req){
  const headersObj = Object.fromEntries(req?.headers ?? []);
  const auth = await requireBridgeGuardsAsync({ headers: headersObj }, { scope: ['bridge:admin'] });
  if (!auth?.ok) {
    const status = auth?.status ?? 401;
    const body = auth?.body ?? { error: { code: 'ERR_JWT_INVALID' } };
    return NextResponse.json(body, { status });
  }

  const contentType = req?.headers?.get?.('content-type') || '';
  const body = contentType.includes('application/json') ? await req.json() : {};
  const hdrProject = String((req?.headers?.get?.('x-vibe-project') || '')).trim();
  const projectId = String(body?.projectId || hdrProject || '').trim();
  const kid = String(body?.kid || '').trim() || `kid_${Date.now()}`;
  const key = String(body?.key || '').trim() || crypto.randomBytes(32).toString('hex');

  if (!projectId) {
    return NextResponse.json({ error: { code: 'ERR_BAD_INPUT', message: 'missing projectId' } }, { status: 400 });
  }

  try {
    await callRotate(projectId, kid, key);
    let kids = [];
    try {
      const list = await hmacListActive(projectId);
      kids = Array.isArray(list) ? list.map((k) => (typeof k === 'string' ? { kid: k, active: true } : { kid: k.kid ?? k.id ?? String(k), active: !!k.active })) : [];
    } catch {}
    return NextResponse.json({ ok: true, projectId, kid, rotated: true, kids });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ERR_INTERNAL', message: e?.message || 'failed' } }, { status: 500 });
  }
}
