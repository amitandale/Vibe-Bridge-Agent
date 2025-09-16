// lib/runner/executor.mjs
// Runner installation wiring: gate with capacity, mint token, render unit, and start service.
import { planProvision } from './provision.mjs';
import { checkCapacity } from '../workspace/capacity.mjs';

function pickOwnerRepo(project){
  const owner = project?.repo_owner || project?.owner || '';
  const repo  = project?.repo_name  || project?.repo  || '';
  return { owner, repo };
}

/** Install a runner with capacity gating and idempotence.
 * adapters: { projects, github, systemd, fsAdapter, capacityAdapters }
 * opts: { projectId, lane, desiredPorts }
 */
export async function installRunner({ projectId, lane, desiredPorts=[] }, adapters){
  const { projects, github, systemd, fsAdapter, capacityAdapters } = adapters;
  if (!projectId || !lane) throw new Error('MISSING_PROJECT_OR_LANE');

  // 1) Capacity gate
  const sys = capacityAdapters?.sys ?? { nproc: async () => 1, memFreeMB: async () => 1024 };
  const ports = capacityAdapters?.ports ?? { isFree: async (_p) => true };
  const cap = await checkCapacity({ sys, ports }, { desiredPorts });
  if (!cap?.ok){
    return { ok:false, code: cap?.code || 'E_CAPACITY' };
  }

  // 2) Project binding and token
  const project = await projects.getById(projectId);
  const { owner, repo } = pickOwnerRepo(project);
  if (!owner || !repo) return { ok:false, code:'PROJECT_NOT_BOUND' };
  const tokenResp = await github.createRegistrationToken({ owner, repo });
  const token = tokenResp?.token;
  if (!token) return { ok:false, code:'TOKEN_MINT_FAILED', hint:'No token from broker' };

  // 3) Plan + write unit
  const plan = planProvision({ projectId, lane, owner, repo, token });
  const unit = plan.files[0];
  await systemd.writeUnit({ path: unit.path, content: unit.content });

  // 4) daemon-reload + enable --now
  await systemd.daemonReload();
  const unitName = unit.path.replace(/^.*\//, '');
  await systemd.enableNow(unitName);

  return { ok:true, unit: unit.path, labels: plan.labels, compose_project: cap.compose_project };
}
