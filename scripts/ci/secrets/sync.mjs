#!/usr/bin/env node
import { listMirrorableNames, getEnvForLane } from '../../../lib/repo/secrets.mjs';
import { get as getProject } from '../../../lib/repo/projects.mjs';
import { getInstallationTokenForProject as _getInstallationTokenForProject } from '../../../lib/github/tokenBroker.mjs';

/** Encrypt value using GitHub Actions public key (libsodium sealed box).
 * If encryptFn is passed, use it (for tests). Otherwise load libsodium-wrappers.
 */
async function encryptWithKey(publicKeyBase64, value, encryptFn){
  if (encryptFn) return encryptFn(publicKeyBase64, value);
  const sodium = await import('libsodium-wrappers');
  await sodium.ready;
  const binkey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const binsec = sodium.from_string(value);
  const enc = sodium.crypto_box_seal(binsec, binkey);
  return sodium.to_base64(enc, sodium.base64_variants.ORIGINAL);
}

export async function mirrorRepoSecrets({ projectId, lane='ci', only=[], http, encryptFn, getInstallationToken } = {}){
  if (!projectId) throw new Error('MISSING_PROJECT_ID');
  const row = getProject(projectId);
  const owner = row?.repo_owner || row?.owner || '';
  const repo  = row?.repo_name  || row?.repo  || '';
  if (!owner || !repo) throw new Error('PROJECT_NOT_BOUND');

  const env = await getEnvForLane(projectId, lane);
  const names = (only && only.length ? only : Object.keys(env));
  const mirror = names.filter(Boolean);

  // Installation token via injectable provider or default broker
  const tokenObj = getInstallationToken
    ? await getInstallationToken(projectId)
    : await _getInstallationTokenForProject(projectId);
  const token = tokenObj.token;

  const fetchLike = http || globalThis.fetch;
  const headers = { 'authorization': `token ${token}`, 'user-agent': 'vibe-bridge-agent', 'content-type': 'application/json' };
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

  // Get repo public key
  let res = await fetchLike(`${apiBase}/actions/secrets/public-key`, { headers });
  let data = await res.json();
  const { key_id, key } = data;
  if (!key_id || !key) throw new Error('NO_PUBLIC_KEY');

  const deny = ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_API_KEY','GEMINI_API_KEY','MISTRAL_API_KEY','LLM_API_KEY'];

  // Mirror each env var
  const results = [];
  for (const name of mirror){
    if (deny.includes(String(name).toUpperCase())) continue;
    const plaintext = env[name];
    if (typeof plaintext === 'undefined') continue;
    const encrypted_value = await encryptWithKey(key, String(plaintext), encryptFn);
    const body = JSON.stringify({ encrypted_value, key_id });
    res = await fetchLike(`${apiBase}/actions/secrets/${encodeURIComponent(name)}`, { method: 'PUT', headers, body });
    results.push({ name, status: res.status || 200 });
  }

  return { owner, repo, lane, mirrored: results.map(r => r.name) };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`){
  const args = process.argv.slice(2);
  const get = (k, d=null) => { const i = args.indexOf(k); return i >=0 ? args[i+1] : d; };
  const projectId = get('--project'); if (!projectId) { console.error('MISSING --project'); process.exit(2); }
  const lane = get('--lane','ci');
  const only = (get('--only','')||'').split(',').map(s=>s.trim()).filter(Boolean);
  mirrorRepoSecrets({ projectId, lane, only }).then(r => {
    console.log(JSON.stringify({ ok: true, ...r }));
  }).catch(e => {
    console.error('ERR', e.code || e.name || '', e.message);
    process.exit(1);
  });
}
