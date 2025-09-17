import { NextResponse } from 'next/server';
import { requireTicket } from '../../../../lib/security/guard.mjs';
import { upsert, listByProject } from '../../../../lib/repo/secrets.mjs';

const checkAdmin = requireTicket(['bridge:admin']);

export async function PUT(request: Request) {
  try {
    await checkAdmin(request);
  } catch (e) {
    return new NextResponse(JSON.stringify({ ok:false, error: e.error || 'forbidden' }), { status: e.status || 403 });
  }

  const body = await request.json();
  const projectId = body.projectId;
  const value = body.value;
  const kid = body.kid || ('k_' + Math.random().toString(36).slice(2,10));
  if (!projectId || !value) {
    return new NextResponse(JSON.stringify({ ok:false, error: 'projectId and value required' }), { status: 400 });
  }
  await upsert({ kid, project_id: projectId, type: 'HMAC', value, active: 1, created_at: Math.floor(Date.now()/1000) });
  const keys = await listByProject(projectId);
  return NextResponse.json({ ok: true, kid, keys });
}
