import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";

export function appClient() {
  const appId = process.env.GH_APP_ID;
  const privateKey = process.env.GH_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !privateKey) throw new Error("Missing GH_APP_ID or GH_PRIVATE_KEY");
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey }
  });
  return appOctokit;
}

export async function installationClient(appOctokit, owner, repo) {
  const { data } = await appOctokit.request("GET /repos/{owner}/{repo}/installation", { owner, repo });
  const installationId = data.id;
  const client = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GH_APP_ID,
      privateKey: process.env.GH_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      installationId
    }
  });
  return client;
}

export async function ensureBranch(octokit, owner, repo, base, branch) {
  const { data: baseRef } = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner, repo, ref: `heads/${base}`
  });
  try {
    await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", { owner, repo, ref: `heads/${branch}` });
  } catch {
    await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
      owner, repo, ref: `refs/heads/${branch}`, sha: baseRef.object.sha
    });
  }
}

export async function getFile(octokit, owner, repo, path, ref) {
  try {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner, repo, path, ref
    });
    if (Array.isArray(data)) throw new Error("Path is a directory");
    const buff = Buffer.from(data.content, "base64");
    return { exists: true, sha: data.sha, text: buff.toString("utf-8") };
  } catch (e) {
    if (e.status === 404) return { exists: false, sha: null, text: "" };
    throw e;
  }
}

export async function putFile(octokit, owner, repo, path, branch, contentText, sha) {
  const content = Buffer.from(contentText, "utf-8").toString("base64");
  const res = await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner, repo, path,
    message: `vibe: update ${path}`,
    content,
    branch,
    ...(sha ? { sha } : {})
  });
  return res.data;
}

export async function deleteFile(octokit, owner, repo, path, branch, sha) {
  await octokit.request("DELETE /repos/{owner}/{repo}/contents/{path}", {
    owner, repo, path,
    message: `vibe: delete ${path}`,
    branch, sha
  });
}

export async function openPR(octokit, owner, repo, head, base, title, body) {
  const { data } = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner, repo, head, base, title, body
  });
  return data;
}
