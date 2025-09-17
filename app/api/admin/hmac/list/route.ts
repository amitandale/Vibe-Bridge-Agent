import { NextResponse } from 'next/server';
import { requireTicket } from '../../../../lib/security/guard.mjs';
import { listByProject } from '../../../../lib/repo/secrets.mjs';

const checkAdmin = requireTicket(['bridge:admin']);

export async function GET(request: Request) {
  try {
    await checkAdmin(request);
  } catch (e) {
    return new NextResponse(JSON.stringify({ ok:false, error: e.error || 'forbidden' }), { status: e.status || 403 });
  }
  const projectId = request.nextUrl.searchParams.get('projectId') || null;
  if (!projectId) return new NextResponse(JSON.stringify({ ok:false, error: 'projectId required' }), { status: 400 });
  const keys = await listByProject(projectId);
  return NextResponse.json({ ok: true, keys });
}
