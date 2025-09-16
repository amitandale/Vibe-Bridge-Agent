// lib/github/bootstrap.mjs
// CI bootstrap for target repos: render workflow and open PR using installation token
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function tmpl(str, map){
  return str.replace(/__([A-Z_]+)__/g, (_, k) => String(map[k] ?? ''));
}

/** Deterministic YAML render. No timestamps. */
export async function renderWorkflow({ projectId, lane='ci', labelsPrefix='vibe' }){
  if (!projectId) throw new Error('MISSING_PROJECT_ID');
  const tplPath = resolve(__dirname, '../assets/workflows/supabase-ci.yml');
  const src = await readFile(tplPath, 'utf8');
  const labels = ['self-hosted', labelsPrefix, projectId, lane].join(', ');
  return tmpl(src, {
    PROJECT: projectId,
    LANE: lane,
    LABELS: labels
  }).trim() + '\n';
}

/**
 * Bootstrap: create a branch, add .github/workflows/supabase-ci.yml, open PR.
 * Dependencies are injected for testability.
 */
export async function bootstrapRepoCI({
  projectId,
  owner,
  repo,
  lane='ci',
  base='main',
  branchName,           // optional override
  saasUrl = process.env.SaaS_URL || process.env.VIBE_SAAS_URL || process.env.SAAS_BASE_URL || '',
  tokenFn,              // async ({ projectId }) => token
  ghFactory,            // async (token) => ({ ensureBranch, getFile, putFile, openPR })
  dryRun=false,
} = {}){
  if (!projectId) throw new Error('MISSING_PROJECT_ID');

  // Load owner/repo from binding if not provided
  if (!owner || !repo){
    const proj = await import('../repo/projects.mjs');
    const row = proj.get(projectId);
    owner = owner || row?.repo_owner || row?.owner;
    repo  = repo  || row?.repo_name  || row?.repo;
  }
  if (!owner || !repo) throw new Error('PROJECT_NOT_BOUND');

  // Default deps
  const { getInstallationTokenForProject } = await import('../github/tokenBroker.mjs');
  if (!tokenFn) tokenFn = ({ projectId }) => getInstallationTokenForProject(projectId);
  if (!ghFactory){
    // Lazy-load the test shim to avoid hard dependency during import
    const gh = await import('../github.testshim.mjs');
    ghFactory = async (token) => {
      const octokit = { token }; // carried only for tests
      return {
        ensureBranch: (owner, repo, head, base) => gh.ensureBranch(octokit, owner, repo, head, base),
        getFile:      (owner, repo, path, branch) => gh.getFile(octokit, owner, repo, path, branch),
        putFile:      (owner, repo, path, branch, content, sha) => gh.putFile(octokit, owner, repo, path, branch, content, sha),
        openPR:       (owner, repo, head, base, title, body) => gh.openPR(octokit, owner, repo, head, base, title, body),
      };
    };
  }

  const token = await tokenFn({ projectId });
  const gh = await ghFactory(token);

  const head = branchName || `vibe/bootstrap-ci/${projectId}/${lane}`;
  // 1) Ensure branch from base
  await gh.ensureBranch(owner, repo, head, base);

  // 2) Render YAML
  const yaml = await renderWorkflow({ projectId, lane });

  // 3) Put file at path
  const path = '.github/workflows/supabase-ci.yml';
  let sha = null;
  try {
    const f = await gh.getFile(owner, repo, path, head);
    sha = f.sha;
  } catch (e) {
    // treat as new file
  }

  if (!dryRun){
    await gh.putFile(owner, repo, path, head, yaml, sha);
  }

  // 4) Open PR
  const title = `chore(ci): bootstrap supabase-ci for ${projectId} [lane:${lane}]`;
  const link = saasUrl ? `\n\nSaaS: ${saasUrl.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}` : '';
  const body = [
    'This PR seeds a minimal self-hosted workflow.',
    '',
    'Runner labels: `self-hosted, vibe, ' + projectId + ', ' + lane + '`.',
    'First run should trigger on the project runner.',
    link
  ].filter(Boolean).join('\n');

  const pr = await gh.openPR(owner, repo, head, base, title, body);
  return { ok:true, prNumber: pr?.number ?? null, branch: head, path, length: yaml.length };
}
