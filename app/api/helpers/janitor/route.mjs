export async function POST(req){
  let body = {};
  try { body = await req.json(); } catch {}
  const { owner, repo, days } = body || {};
  // Placeholder: would close stale branches/PRs
  return new Response(JSON.stringify({ ok:true, processed: 0 }), { status:200 });
}
