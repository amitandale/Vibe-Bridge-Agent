import { requireBridgeGuards } from '../../../../lib/security/guard.mjs';
// app/api/projects/bind/route.mjs
import { setRepoBinding, validateOwner, validateRepo } from '../../../../lib/repo/projects.mjs';

/**
 * Best-effort mirror of the binding to SaaS control plane.
 * Uses HMAC-SHA256 over the raw JSON body with the shared agent secret.
 */
async function mirrorToSaaS(payload){
  const baseUrl = process.env.SaaS_URL || process.env.VIBE_SAAS_URL || process.env.SAAS_BASE_URL;
  const agentId = process.env.AGENT_ID || process.env.VIBE_AGENT_ID;
  const agentSecret = process.env.AGENT_SECRET || process.env.VIBE_AGENT_SECRET;
  if (!baseUrl || !agentId || !agentSecret) return { ok: false, skipped: true };

  const body = JSON.stringify(payload);
  const { createHmac } = await import('node:crypto');
  const sig = createHmac('sha256', String(agentSecret)).update(body).digest('hex');

  try {
    const url = new URL('/internal/projects/bind', baseUrl).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-id': agentId,
        'x-agent-signature': `sha256=${sig}`,
      },
      body,
    });
    const ok = res.ok;
    const status = res.status;
    let json = null;
    try { json = await res.json(); } catch {}
    return { ok, status, json };
  } catch (e){
    return { ok: false, error: String(e) };
  }
}

export async function POST(req){
  const { projectId, owner, repo } = await req.json();

  if (!projectId || !validateOwner(owner) || !validateRepo(repo)){
    return new Response(
      JSON.stringify({ ok:false, error: 'INVALID_OWNER_OR_REPO', projectId, owner, repo }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  try {
    setRepoBinding(projectId, { owner, repo });
  } catch (e){
    return new Response(
      JSON.stringify({ ok:false, error: (e && e.message) ? e.message : String(e) }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const mirrored = await mirrorToSaaS({ projectId, owner, repo });

  return new Response(
    JSON.stringify({ ok:true, projectId, owner, repo, mirrored }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
