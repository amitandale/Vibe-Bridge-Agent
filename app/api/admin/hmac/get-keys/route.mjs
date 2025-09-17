// app/api/admin/hmac/get-keys/route.mjs
import { listActiveForProject } from '../../../../lib/repo/secrets.mjs';
import { requireTicket } from '../../../../lib/security/guard.mjs';

export async function GET(req){
  const g = await requireTicket(req, { scope: 'admin:hmac' });
  if (!g.ok) {
    const body = JSON.stringify(g.body || { error:{ code:g.code || 'UNAUTHORIZED' } });
    return new Response(body, { status: g.status || 401, headers: { 'content-type':'application/json' } });
  }
  const url = new URL(req.url);
  const projectId = url.searchParams.get('project_id');
  if (!projectId) {
    return new Response(JSON.stringify({ error:{ code:'MISSING_PROJECT_ID' } }), { status:400, headers:{ 'content-type':'application/json' } });
  }
  const keys = listActiveForProject(projectId);
  return new Response(JSON.stringify({ ok:true, keys }), { status:200, headers:{ 'content-type':'application/json' } });
}
