// lib/github.mjs
// Dynamic Octokit loader to avoid hard dependency during test import
let _Octokit = null;
let _createAppAuth = null;

async function loadSdk(){
  if (_Octokit && _createAppAuth) return { Octokit: _Octokit, createAppAuth: _createAppAuth };
  try {
    const [{ Octokit }, { createAppAuth }] = await Promise.all([
      import('octokit'),
      import('@octokit/auth-app')
    ]);
    _Octokit = Octokit;
    _createAppAuth = createAppAuth;
    return { Octokit, createAppAuth };
  } catch (e) {
    const err = new Error('GITHUB_SDK_UNAVAILABLE');
    err.cause = e;
    throw err;
  }
}

export async function appClient() {
  const { Octokit, createAppAuth } = await loadSdk();
  const appId = process.env.GH_APP_ID;
  const privateKey = process.env.GH_PRIVATE_KEY?.replace(/\n/g, "\n");
  if (!appId || !privateKey) throw new Error("Missing GH_APP_ID or GH_PRIVATE_KEY");
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey }
  });
  return appOctokit;
}

export async function installationClient(appOctokit, owner, repo) {
  const { data } = await appOctokit.request("GET /repos/{owner}/{repo}/installation", { owner, repo });
  const { Octokit } = await loadSdk();
  const installationOctokit = new Octokit({
    auth: async () => {
      const res = await appOctokit.request("POST /app/installations/{installation_id}/access_tokens", {
        installation_id: data.id
      });
      return res.data.token;
    }
  });
  return installationOctokit;
}

export async function ensureBranch(octokit, owner, repo, base, branch) {
  try {
    await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", { owner, repo, ref: `heads/${branch}` });
    return;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const { data: baseRef } = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", { owner, repo, ref: `heads/${base}` });
  const sha = baseRef.object.sha;
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner, repo, ref: `refs/heads/${branch}`, sha
  });
}

export async function getFile(octokit, owner, repo, path, branch) {
  try {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner, repo, path, ref: branch
    });
    const buff = Buffer.from(data.content, data.encoding || 'base64');
    return { exists: true, content: buff.toString('utf8'), sha: data.sha };
  } catch (e) {
    if (e.status === 404) return { exists: false };
    throw e;
  }
}

export async function putFile(octokit, owner, repo, path, branch, content, sha) {
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  const { data } = await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner, repo, path,
    message: `vibe: update ${path}`,
    content: b64,
    branch, sha: sha || undefined
  });
  return data;
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

// Short-lived token client
export async function tokenClient(token) {
  if (!token) throw new Error("missing token");
  const { Octokit } = await loadSdk();
  const octokit = new Octokit({ auth: token });
  return octokit;
}
