export async function POST(req){
  const { owner, repo, days } = await req.json();
  // Placeholder: would close stale branches/PRs
  return new Response(JSON.stringify({ ok:true, processed: 0 }), { status:200 });
}
