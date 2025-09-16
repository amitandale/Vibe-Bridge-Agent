
// Patch block for PR-03: to be merged into your existing run-agent route.js
// Insert after HMAC validation (where `valid` is checked). Example:
/*
  const projectId = request.headers.get('x-vibe-project') || '';
  const ticket = request.headers.get('x-vibe-ticket') || (request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if (!ticket) {
    return new Response(JSON.stringify({ ok:false, errorCode:'MISSING_TICKET' }), { status: 401 });
  }
  try {
    const mod = await import('../../../lib/security/guard.mjs');
    const v = await mod.verifyTicket(ticket, { scope:'prs.open', aud:'ci' });
    if (!projectId) return new Response(JSON.stringify({ ok:false, errorCode:'MISSING_PROJECT' }), { status: 400 });
    if (mod.isDisabled(projectId)) {
      return new Response(JSON.stringify({ ok:false, errorCode:'BRIDGE_DISABLED' }), { status: 403 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, errorCode:'TICKET_INVALID', message:String(e.message||'') }), { status: 401 });
  }
*/
