// lib/runner/executor.mjs
// Runner installation wiring: gate with capacity, mint token, render unit, and start service.
import { planProvision } from './provision.mjs';
import { checkCapacity } from '../workspace/capacity.mjs';

function pickOwnerRepo(project){
  const owner = project?.repo_owner || project?.owner || '';
  const repo  = project?.repo_name  || project?.repo  || '';
  return { owner, repo };
}

export async function installRunner({ projectId, lane, desiredPorts=[] }, adapters){
  const { projects, github, systemd, fsAdapter, capacityAdapters } = adapters;
  if (!projectId || !lane) throw new Error('MISSING_PROJECT_OR_LANE');

  // 1) Capacity gate
  const cap = await checkCapacity({ projectId, lane, desiredPorts }, capacityAdapters);
  if (!cap.ok) return cap;

  // 2) Resolve project owner/repo
  const project = projects.get(projectId);
  const { owner, repo } = pickOwnerRepo(project);
  if (!owner || !repo) return { ok:false, code:'PROJECT_NOT_BOUND', hint:'Bind repo_owner/repo_name to project before installing runner' };

  // 3) Mint registration token via SaaS broker
  const tokenResp = await github.getRunnerRegistrationTokenForProject(projectId);
  const token = tokenResp?.token;
  if (!token) return { ok:false, code:'TOKEN_MINT_FAILED', hint:'No token from broker' };

  // 4) Plan and write systemd unit
  const plan = planProvision({ projectId, lane, owner, repo, token });
  const unit = plan.files[0];
  await systemd.writeUnit({ path: unit.path, content: unit.content });

  // 5) daemon-reload + enable --now
  await systemd.daemonReload();
  const unitName = unit.path.replace(/^.*\//, '');
  await systemd.enableNow(unitName);

  return { ok:true, unit: unit.path, labels: plan.labels, compose_project: cap.compose_project };
}
