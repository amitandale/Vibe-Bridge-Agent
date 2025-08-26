export async function POST(req){
  let body = {};
  try { body = await req.json(); } catch {}
  const { owner, repo, prNumber } = body || {};
  // Placeholder: in real code query GitHub checks; here just acknowledge
  return new Response(JSON.stringify({ ok:true, reconciled: true, owner, repo, prNumber }), { status:200 });
}
