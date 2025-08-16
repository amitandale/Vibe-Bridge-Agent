import { appClient } from "../../../lib/github.js";
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

  const { owner, repoName, template } = JSON.parse(raw);

  try {
    const app = appClient();
    // TODO: get installation octokit for the org; simplified for skeleton
    await app.request("POST /orgs/{org}/repos", { org: owner, name: repoName, private: true });

    for (const f of (template?.files||[])) {
      await app.request("PUT /repos/{owner}/{repo}/contents/{path}", {
        owner, repo: repoName, path: f.path, message: "chore: scaffold", content: f.content, branch: "main"
      });
    }

    const { data: pr } = await app.request("POST /repos/{owner}/{repo}/pulls", {
      owner, repo: repoName, head: "main", base: "main", title: "Scaffold", body: "Initial scaffold"
    });

    return new Response(JSON.stringify({ ok:true, repoUrl:`https://github.com/${owner}/${repoName}`, prUrl: pr.html_url }), { status:200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e?.message||e) }), { status:500 });
  }
}
