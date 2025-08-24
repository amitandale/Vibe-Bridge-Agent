import { listPlanItems } from '../../../../lib/plan/store.mjs';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId') || process.env.PROJECT_ID || 'default';
    const items = await listPlanItems({ projectId });
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'UNKNOWN' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
