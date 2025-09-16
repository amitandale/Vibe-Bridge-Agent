// lib/runner/github.adapter.mjs
// List remote self-hosted runners for owner/repo via GitHub REST. Injectable fetch for tests.

/** Map GitHub runner JSON to lightweight shape */
function mapRunner(r){
  return { id: r.id, name: r.name, status: r.status, labels: (r.labels||[]).map(l=>l.name) };
}

/** List remote runners filtered by optional labels (array of strings). */
export async function listRemote({ owner, repo, token, baseUrl = 'https://api.github.com', fetcher } = {}, { labels = [] } = {}){
  if (!owner) throw new Error('MISSING_OWNER');
  // We query repo runners if repo provided; otherwise org runners
  const path = repo ? `/repos/${owner}/${repo}/actions/runners` : `/orgs/${owner}/actions/runners`;
  const url = `${baseUrl}${path}`;
  const res = await (fetcher ? fetcher(url, { headers: token ? { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } : {} })
                              : fetch(url, { headers: token ? { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } : {} }));
  if (!res || !res.ok) throw new Error('GITHUB_LIST_FAILED');
  const data = await res.json();
  let runners = (data.runners || []).map(mapRunner);
  if (labels && labels.length){
    runners = runners.filter(r => labels.every(lbl => r.labels.includes(lbl)));
  }
  return runners;
}
