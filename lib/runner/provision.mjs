// lib/runner/provision.mjs
// Planner for provisioning a GitHub self-hosted runner per project/lane.
// Pure planning for testability. No network or systemd side effects here.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Render label list for GitHub runner */
export function renderLabels({ projectId, lane }){
  const base = ['vibe'];
  if (projectId) base.push(projectId);
  if (lane) base.push(lane);
  return base.join(',');
}

/** Resolve filesystem layout deterministically */
export function resolveLayout({ projectId, lane, user='devops', rootBase='/opt/github-runner' }){
  if (!projectId || !lane) throw new Error('MISSING_PROJECT_OR_LANE');
  const root = `${rootBase}/${projectId}/${lane}`;
  const work = path.join(root, '_work');
  const svcName = `github-runner@${projectId}-${lane}.service`;
  return { root, work, svcName, user };
}

/** Render a systemd unit from a minimal template map */
export function renderSystemdUnit({ projectId, lane, owner, repo, token, user='devops', rootBase='/opt/github-runner' }){
  const { root, work } = resolveLayout({ projectId, lane, user, rootBase });
  const labels = renderLabels({ projectId, lane });
  // Registration command uses GitHub's runner config.sh flags. Token is short-lived.
  const register = [
    `${root}/config.sh`,
    `--url`, `https://github.com/${owner}/${repo}`,
    `--token`, token,
    `--unattended`,
    `--labels`, labels
  ].join(' ');

  return {
    Unit: {
      Description: `GitHub Runner for ${owner}/${repo} [${projectId}/${lane}]`,
      After: 'network.target'
    },
    Service: {
      Type: 'simple',
      User: user,
      WorkingDirectory: root,
      ExecStartPre: register,
      ExecStart: `${root}/runsvc.sh`,
      Restart: 'always'
    },
    Install: { WantedBy: 'multi-user.target' },
    labels, root, work
  };
}

/** Build a shell-safe .service file text */
export function serializeUnit(unit){
  const lines = [];
  for (const [sec, kv] of Object.entries(unit)){
    if (['labels','root','work'].includes(sec)) continue;
    lines.push(`[${sec}]`);
    for (const [k,v] of Object.entries(kv)){
      lines.push(`${k}=${v}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Plan-only function. Caller will fetch token and owner/repo separately. */
export function planProvision({ projectId, lane, owner, repo, token, user='devops', rootBase='/opt/github-runner', systemdDir='/etc/systemd/system' }){
  if (!projectId || !lane) throw new Error('MISSING_PROJECT_OR_LANE');
  if (!owner || !repo) throw new Error('PROJECT_NOT_BOUND');
  if (!token) throw new Error('MISSING_TOKEN');
  const unit = renderSystemdUnit({ projectId, lane, owner, repo, token, user, rootBase });
  const text = serializeUnit(unit);
  const layout = resolveLayout({ projectId, lane, user, rootBase });
  return {
    labels: unit.labels,
    files: [
      { path: `${systemdDir}/${layout.svcName}`, mode: '0644', content: text }
    ],
    layout
  };
}
