export async function POST(req){
  let body = {};
  try { body = await req.json(); } catch {}
  const { owner, repo, prNumber, allow } = body || {};
  // Placeholder: would call GitHub merge if policies pass
  return new Response(JSON.stringify({ ok:true, attempt: !!allow }), { status:200 });
}
