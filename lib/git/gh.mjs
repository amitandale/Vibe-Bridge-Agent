const GITHUB_API = 'https://api.github.com';

function env(name, fallback=null){ return process.env[name] ?? fallback; }
function requiredEnv(name){
  const v = env(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

function slugify(s=''){
  return String(s).toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
}

async function ghRequest(path, { method='GET', token = '', body } = {}) {
  const url = `${GITHUB_API}${path}`;
  const headers = {
    'accept': 'application/vnd.github+json',
    'content-type': 'application/json'
  };
  if (token) headers['authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>''); // helpful for debugging
    const err = new Error(`GITHUB_${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  if (res.status === 204) return null;
  return await res.json();
}

async function ensureBranch({ owner, repo, base='main', branch, token = '' }) {
  try {
    const baseRef = await ghRequest(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(base)}`, { token });
    const baseSha = baseRef.object && baseRef.object.sha || baseRef.sha;
    await ghRequest(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      token,
      body: { ref: `refs/heads/${branch}`, sha: baseSha }
    });
  } catch (e) {
    if (e.status === 401) throw new Error('PROVIDER_UNAUTHORIZED');
    if (e.status === 403) throw new Error('PROVIDER_FORBIDDEN');
    if (e.status === 422) return; // already exists
    throw e;
  }
}

function b64(s){ return Buffer.from(String(s), 'utf8').toString('base64'); }

async function commitFilesViaContentsAPI({ owner, repo, branch, files, message, token = '' }) {
  for (const f of files) {
    try {
      await ghRequest(`/repos/${owner}/${repo}/contents/${encodeURIComponent(f.path)}`, {
        method: 'PUT',
        token,
        body: {
          message,
          content: b64(f.content),
          branch
        }
      });
    } catch (e) {
      if (e.status === 401) throw new Error('PROVIDER_UNAUTHORIZED');
      if (e.status === 403) throw new Error('PROVIDER_FORBIDDEN');
      if (e.status === 422) throw new Error('VALIDATION_FAILED');
      throw e;
    }
  }
}

export async function openPullRequest({ projectRoot, worktree, ticket, title, body, base='main' }) {
  // Token optional to allow tests to simulate 401s
  const token = env('GITHUB_TOKEN', '');
  const repoFull = requiredEnv('GITHUB_REPO'); // "owner/name"
  const [owner, repo] = repoFull.split('/');
  if (!owner || !repo) throw new Error('MALFORMED_ENV:GITHUB_REPO');

  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  const slug = slugify((ticket ? String(ticket) : ymd) + '-' + (title || 'compose'));
  const branch = `ai/${slug}`;

  const { files, commitMessage } = await worktree.finalize({ conventionalMessage: `chore(ai): ${title || 'compose changes'}` });

  await ensureBranch({ owner, repo, base, branch, token });
  await commitFilesViaContentsAPI({ owner, repo, branch, files, message: commitMessage, token });

  try {
    const pr = await ghRequest(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      token,
      body: { title: title || 'AI PR', head: branch, base, body }
    });
    return { id: pr.number || pr.id, url: pr.html_url, branch, title: pr.title, body: pr.body };
  } catch (e) {
    if (e.status === 401) throw new Error('PROVIDER_UNAUTHORIZED');
    if (e.status === 403) throw new Error('PROVIDER_FORBIDDEN');
    if (e.status === 422) throw new Error('PR_EXISTS_OR_INVALID');
    throw e;
  }
}
