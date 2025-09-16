// lib/runner/executor.mjs
// Runner installation wiring: gate with capacity, mint token, install bundle, render unit, and start service.
import { planProvision, resolveLayout } from './provision.mjs';
import { checkCapacity } from '../workspace/capacity.mjs';

function pickOwnerRepo(project){
  const owner = project?.repo_owner || project?.owner || '';
  const repo  = project?.repo_name  || project?.repo  || '';
  return { owner, repo };
}

/** Install a runner with capacity gating and idempotence.
 * adapters: { projects, github, systemd, hostfs, capacityAdapters, bundle }
 * opts: { projectId, lane, desiredPorts, bundlePath, bundleUrl, rootBase, projectsBase, replace }
 */
export async function installRunner(opts, adapters){
  const {
    projectId, lane, desiredPorts = [],
    bundlePath = '', bundleUrl = '',
    rootBase = '/opt/github-runner',
    projectsBase = '/home/devops/projects',
    replace = false,
  } = opts || {};
  const { projects, github, systemd, hostfs, capacityAdapters, bundle } = adapters;

  if (!projectId || !lane) throw new Error('MISSING_PROJECT_OR_LANE');

  // 0) Logs path
  const laneDir = `${projectsBase}/${projectId}/${lane}`;
  const logPath = `${laneDir}/install.log`;
  async function log(msg){
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
      await hostfs.writeFile(logPath, (await import('node:fs/promises')).readFile ? '' : line, 0o640);
    } catch {}
    try {
      const fs = await import('node:fs/promises');
      const prev = await fs.readFile(logPath, 'utf-8').catch(()=> '');
      await fs.writeFile(logPath, prev + line);
    } catch {}
  }
  try { await hostfs.mkdirp(`${projectsBase}/${projectId}`, 0o750); await hostfs.mkdirp(laneDir, 0o750); } catch {}

  // 1) Capacity gate
  const cap = await checkCapacity({ projectId, lane, desiredPorts }, capacityAdapters);
  if (!cap.ok) return cap;

  // 2) Resolve project owner/repo
  const project = projects.get(projectId);
  const { owner, repo } = pickOwnerRepo(project);
  if (!owner || !repo) return { ok:false, code:'PROJECT_NOT_BOUND', hint:'Bind repo_owner/repo_name to project before installing runner' };

  // 3) Idempotence: skip if unit exists and runner registered
  const { root } = resolveLayout({ projectId, lane, rootBase });
  const unitName = `github-runner@${projectId}-${lane}.service`;
  const unitPath = `/etc/systemd/system/${unitName}`;
  const unitExists = await (systemd.hasUnitFile ? systemd.hasUnitFile(unitPath) : false);
  const already = await (github.runnerExists ? github.runnerExists({ name: `${projectId}-${lane}` }) : false);
  if (unitExists && already && !replace){
    await log('idempotent skip: unit exists and runner registered');
    return { ok:true, skipped:true, unit: unitPath, compose_project: cap.compose_project };
  }

  // 4) Mint registration token via SaaS broker
  let token;
  try {
    const tokenResp = await github.getRunnerRegistrationTokenForProject(projectId);
    token = tokenResp?.token;
  } catch (e){
    return { ok:false, code:'E_TOKEN_MINT_FAILED', hint: String(e && e.message || e) };
  }
  if (!token) return { ok:false, code:'E_TOKEN_MINT_FAILED', hint:'No token from broker' };

  // 5) Install bundle into root dir
  try {
    await hostfs.mkdirp(root, 0o755);
    if (bundle && (bundlePath || bundleUrl)){
      await bundle.installBundle({ bundlePath, destDir: root });
    }
    // chown - best effort
    await hostfs.chownr(root, 1000, 1000); // devops:devops by convention
  } catch (e){
    return { ok:false, code:'E_BUNDLE_INSTALL_FAILED', hint: String(e && e.message || e) };
  }

  // 6) Plan and write systemd unit
  let plan;
  try {
    plan = planProvision({ projectId, lane, owner, repo, token, rootBase });
    const unit = plan.files[0];
    await systemd.writeUnit({ path: unit.path, content: unit.content });
  } catch (e){
    return { ok:false, code:'E_SYSTEMD_WRITE_FAILED', hint: String(e && e.message || e) };
  }

  // 7) daemon-reload + enable --now
  try {
    await systemd.daemonReload();
    await systemd.enableNow(unitName);
  } catch (e){
    return { ok:false, code:'E_SYSTEMD_ENABLE_FAILED', hint: String(e && e.message || e) };
  }

  await log('install complete');

  return { ok:true, unit: unitPath, labels: plan.labels, compose_project: cap.compose_project };
}
