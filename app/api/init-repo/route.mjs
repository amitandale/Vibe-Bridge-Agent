import crypto from "crypto";

function verify(raw, sig, secret) {
  const h = crypto.createHmac("sha256", secret); h.update(raw);
  const expected = "sha256="+h.digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig||"")); } catch { return false; }
}

export async function POST(req) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-signature"), process.env.BRIDGE_SECRET))
    return new Response(JSON.stringify({ ok:false, error:"SIGNATURE_INVALID" }), { status:401 });

  let owner='', repoName='', template='';
  try {
    const j = JSON.parse(raw||"{}");
    owner = j.owner || '';
    repoName = j.repoName || '';
    template = j.template || '';
  } catch {
    return new Response(JSON.stringify({ ok:false, error:"BAD_JSON" }), { status:400 });
  }
  //
  // ... would call GitHub to create repo from template, setup webhooks, etc.
  //
  return new Response(JSON.stringify({ ok:true, owner, repoName, template }), { status:200 });
}
