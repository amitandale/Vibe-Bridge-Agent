import { createPlanItem } from '../../../../lib/plan/store.mjs';
import { makeLlamaIndexClient } from '../../../../lib/vendors/llamaindex.client.mjs';

export async function POST(req) {
  try {
    const j = await req.json().catch(() => ({}));
    const projectId = j?.projectId || process.env.PROJECT_ID || 'default';

    const item = await createPlanItem({
      projectId,
      title: j?.title,
      prompt: j?.prompt,
      scope: j?.scope,
      tests: j?.tests,
      acceptance: j?.acceptance,
      status: 'PLANNED',
      changedFiles: Array.isArray(j?.changedFiles) ? j.changedFiles : [],
    });

    // Fire-and-forget LlamaIndex upsert if enabled.
    if (String(process.env.LI_UPSERT_ON_PLAN).toLowerCase() === 'true') {
      try {
        // schedule after response cycle
        setTimeout(async () => {
          try {
            const client = makeLlamaIndexClient(); // uses env + global fetch in CI
            const docs = (Array.isArray(j?.changedFiles) ? j.changedFiles : []).map((f, i) => ({
              id: f.id || `doc_${i}`,
              path: f.path || f.filepath || `file_${i}`,
              mime: f.mime || 'text/plain',
              content: typeof f.content === 'string' ? f.content : '',
            }));
            if (docs.length > 0) {
              await client.upsert({ projectId, docs, idempotencyKey: item.id });
            }
          } catch (_) {}
        }, 0);
      } catch (_) {}
    }

    return new Response(JSON.stringify({ id: item.id }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    const msg = e?.message || 'UNKNOWN';
    const code = msg.startsWith('MISSING_') ? 400 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status: code,
      headers: { 'content-type': 'application/json' },
    });
  }
}
