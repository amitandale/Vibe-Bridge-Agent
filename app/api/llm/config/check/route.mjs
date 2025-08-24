import { checkClaude } from '../../../../../lib/config/project.mjs';

export async function GET(_req) {
  try {
    const res = await checkClaude();
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'UNKNOWN' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
