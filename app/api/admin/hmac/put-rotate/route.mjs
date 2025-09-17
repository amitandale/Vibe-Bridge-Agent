// app/api/admin/hmac/put-rotate/route.mjs
import { setHmacKey, setActiveHmacKid } from '../../../../lib/repo/secrets.mjs';
import { requireTicket } from '../../../../lib/security/guard.mjs';

export async function PUT(req){
  const g = await requireTicket(req, { scope: 'admin:hmac' });
  if (!g.ok) {
    const body = JSON.stringify(g.body || { error:{ code:g.code || 'UNAUTHORIZED' } });
    return new Response(body, { status: g.status || 401, headers: { 'content-type':'application/json' } });
  }
  const body = await req.json().catch(()=>({}));
  const { project_id, newKid, newKey } = body || {};
  if (!project_id || !newKid || !newKey) {
    return new Response(JSON.stringify({ error:{ code:'MISSING_FIELDS' } }), { status:400, headers:{ 'content-type':'application/json' } });
  }
  await setHmacKey({ projectId: project_id, kid: newKid, key: newKey });
  await setActiveHmacKid({ projectId: project_id, kid: newKid });
  return new Response(JSON.stringify({ ok:true, rotated:{ project_id, kid:newKid } }), { status:200, headers:{ 'content-type':'application/json' } });
}
