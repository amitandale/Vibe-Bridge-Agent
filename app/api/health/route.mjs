// app/api/health/route.mjs
// Liveness: 200 if the process can respond. No secret required.
export const dynamic = 'force-dynamic';
export async function GET() {
  const body = { ok: true, ts: Date.now() };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200
  });
}
