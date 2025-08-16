export async function POST(req) {
  const { owner, repo, prNumber, allow } = await req.json();
  // TODO: if allow && label present && policy-approved, call GitHub merge
  return new Response(JSON.stringify({ ok:true, attempted: !!allow }), { status:200 });
}
