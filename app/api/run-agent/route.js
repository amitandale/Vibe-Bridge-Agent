import crypto from "crypto";
import { z } from "zod";
import { appClient, installationClient, ensureBranch, getFile, putFile, deleteFile, openPR } from "../../../lib/github";
import { parseUnifiedDiff, applyHunksToContent } from "../../../lib/diff";

const Payload = z.object({
  mode: z.enum(["fixed-diff"]).default("fixed-diff"),
  owner: z.string().min(1),
  repo: z.string().min(1),
  base: z.string().min(1), // base branch
  title: z.string().min(1).max(200),
  diff: z.string().min(1),
  options: z.object({
    branch: z.string().min(1).optional(),
    maxHunks: z.number().int().min(1).max(1000).optional(),
    maxBytes: z.number().int().min(1).max(1024*1024).optional()
  }).optional()
});

function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret) return false;
  const h = crypto.createHmac("sha256", secret);
  h.update(rawBody);
  const expected = "sha256=" + h.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader || ""));
}

export async function POST(request) {
  const raw = await request.text();
  const valid = verifySignature(raw, request.headers.get("x-signature"), process.env.BRIDGE_SECRET);
  if (!valid) {
    return new Response(JSON.stringify({ ok:false, errorCode:"SIGNATURE_INVALID", message:"Invalid signature" }), { status: 401 });
  }
  let payload;
  try {
    payload = Payload.parse(JSON.parse(raw));
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, errorCode:"BAD_PAYLOAD", message:e.message }), { status: 400 });
  }

  const { owner, repo, base, title, diff } = payload;
  const branch = payload.options?.branch || `vibe/${Date.now()}`;
  const maxHunks = payload.options?.maxHunks ?? 1000;
  const maxBytes = payload.options?.maxBytes ?? 256*1024;

  if (Buffer.byteLength(diff, "utf-8") > maxBytes) {
    return new Response(JSON.stringify({ ok:false, errorCode:"DIFF_TOO_LARGE", message:`diff exceeds ${maxBytes} bytes` }), { status: 413 });
  }

  // Parse diff
  let files;
  try {
    files = parseUnifiedDiff(diff);
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, errorCode:"DIFF_PARSE_ERROR", message:e.message }), { status: 400 });
  }
  if (files.length === 0) {
    return new Response(JSON.stringify({ ok:false, errorCode:"NO_FILES", message:"No file patches found" }), { status: 400 });
  }
  let hunkCount = files.reduce((n,f) => n + f.hunks.length, 0);
  if (hunkCount > maxHunks) {
    return new Response(JSON.stringify({ ok:false, errorCode:"TOO_MANY_HUNKS", message:`hunks exceed ${maxHunks}` }), { status: 400 });
  }
  if (files.some(f => /(^|\n)(rename|copy)\s+/.test(diff))) {
    return new Response(JSON.stringify({ ok:false, errorCode:"RENAME_NOT_SUPPORTED", message:"rename/copy not supported in v1" }), { status: 400 });
  }

  // GitHub App clients
  let appOctokit, instOctokit;
  try {
    appOctokit = appClient();
    instOctokit = await installationClient(appOctokit, owner, repo);
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, errorCode:"GITHUB_APP", message:e.message }), { status: 500 });
  }

  // Create branch
  try {
    await ensureBranch(instOctokit, owner, repo, base, branch);
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, errorCode:"BRANCH_ERROR", message:e.message }), { status: 500 });
  }

  // Apply patches file-by-file via Contents API
  try {
    for (const f of files) {
      const path = f.newPath || f.oldPath;
      if (!path) continue;
      if (f.isDelete) {
        const current = await getFile(instOctokit, owner, repo, path, base);
        if (current.exists) {
          await deleteFile(instOctokit, owner, repo, path, branch, current.sha);
        } else {
          throw new Error(`Cannot delete missing file: ${path}`);
        }
        continue;
      }
      const baseFile = await getFile(instOctokit, owner, repo, path, base);
      const baseText = baseFile.exists ? baseFile.text : "";
      const nextText = applyHunksToContent(baseText, f.hunks);
      await putFile(instOctokit, owner, repo, path, branch, nextText, baseFile.exists ? baseFile.sha : undefined);
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, errorCode:"PATCH_APPLY", message:e.message }), { status: 400 });
  }

  // Open PR
  try {
    const pr = await openPR(instOctokit, owner, repo, branch, base, title, "Applied unified diff via Vibe Bridge\n\n```diff\n" + diff.slice(0, 5000) + "\n```");
    return new Response(JSON.stringify({ ok:true, prUrl: pr.html_url, prNumber: pr.number }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, errorCode:"OPEN_PR", message:e.message }), { status: 500 });
  }
}
