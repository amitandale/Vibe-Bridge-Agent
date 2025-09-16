// app/api/projects/bind/route.mjs
import { setRepoBinding, validateOwner, validateRepo } from '../../../../lib/repo/projects.mjs';

async function mirrorToSaaS(payload){
  const baseUrl = process.env.SaaS_URL || process.env.VIBE_SAAS_URL || process.env.SAAS_URL;
  const agentId = process.env.AGENT_ID || process.env.VIBE_AGENT_ID;
  const agentSecret = process.env.AGENT_SECRET || process.env.VIBE_AGENT_SECRET;
  if (!baseUrl || !agentId || !agentSecret) return { ok: false, skipped: true }; // mirror optional
  // HMAC sign
  const body = JSON.stringify(payload);
  const crypto = await import('node:crypto');
  const h = crypto.createHmac('sha256', String(agentSecret)); h.update(body);
  const sig = 'sha256=' + h.digest('hex');
  try {
    const res = await fetch(new URL('/internal/projects/bind', baseUrl).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-id': agentId, 'x-agent-signature': sig },
      body
    });
    if (!res.ok) return { ok:false, status: res.status };
    return await res.json();
  } catch {
    return { ok:false, network:true };
  }
}

export async function POST(req){
  const { projectId, owner, repo } = await req.json();
  if (!projectId || !validateOwner(owner) || !validateRepo(repo)){
    return new Response(JSON.stringify({ ok:false, error: 'INVALID_INPUT' ), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  try {
    setRepoBinding(projectId, { owner, repo });
  } catch (e){
    return new Response(JSON.stringify({ ok:false, error: e.message || 'ERROR' ), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  // Best effort mirror
  const mirrored = await mirrorToSaaS({ projectId, owner, repo });
  return new Response(JSON.stringify({ ok:true, projectId, owner, repo, mirrored });
}
