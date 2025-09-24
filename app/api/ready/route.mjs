// app/api/ready/route.mjs
// Readiness: checks configuration and dependencies.
export const dynamic = 'force-dynamic';
export async function GET() {
  const checks = {
    BRIDGE_SECRET: !!process.env.BRIDGE_SECRET
  };
  const ready = Object.values(checks).every(Boolean);
  const status = ready ? 200 : 503;
  const body = { ok: ready, checks, ts: Date.now() };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status
  });
}
