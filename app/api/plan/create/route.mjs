import { requireBridgeGuardsAsync } from '../../../../lib/security/guard.mjs';
import { requireBridgeGuards } from '../../../../lib/security/guard.mjs';
import { createPlanItem } from '../../../../lib/plan/store.mjs';

export async function POST(req) {
  try {
    const j = await req.json();
    const projectId = j?.projectId || process.env.PROJECT_ID || 'default';
    const item = await createPlanItem({
      projectId,
      title: j?.title,
      prompt: j?.prompt,
      scope: j?.scope,
      tests: j?.tests,
      acceptance: j?.acceptance,
      status: 'PLANNED',
    });
                try {
                  if ((process.env.LI_UPSERT_ON_PLAN || 'false').toString().toLowerCase() === 'true') {
                    const changed = Array.isArray(j && j.changedFiles) ? j.changedFiles : [];
                    if (changed.length > 0) {
                      const mod = await import('../../../../lib/vendors/llamaindex.client.mjs');
                      const client = mod.makeLlamaIndexClient();
                      const docs = changed.map(x => (typeof x === 'string' ? { path: x, mime: 'text/plain', content: '' } : x));
                      client.upsert({ projectId, docs, idempotencyKey: 'plan-' + String(item.id) }).catch(() => {});
                    }
                  }
                } catch {}
            return new Response(JSON.stringify({ id: item.id }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    const msg = e?.message || 'UNKNOWN';
    const code = msg.startsWith('MISSING_') ? 400 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status: code,
      headers: { 'content-type': 'application/json' }
    });
  }
}
