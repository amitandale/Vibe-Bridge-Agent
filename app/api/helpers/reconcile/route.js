export async function POST(req) {
  const { owner, repo, prNumber } = await req.json();
  // TODO: poll GitHub checks/status and synthesize preview URL if missing
  return new Response(JSON.stringify({ ok:true, reconciled:true }), { status:200 });
}
