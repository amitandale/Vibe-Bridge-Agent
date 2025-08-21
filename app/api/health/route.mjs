// app/api/health/route.js
export async function GET() {
  const hasSecret = !!process.env.BRIDGE_SECRET;
  return new Response(JSON.stringify({ ok: hasSecret, ts: Date.now() }), {
    headers: { 'content-type': 'application/json' },
    status: hasSecret ? 200 : 500
  });
}
