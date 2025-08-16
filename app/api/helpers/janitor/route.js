export async function POST(req) {
  const { owner, repo, days } = await req.json();
  // TODO: close stale PRs/branches older than 'days' (policy-driven)
  return new Response(JSON.stringify({ ok:true, closed: 0 }), { status:200 });
}
