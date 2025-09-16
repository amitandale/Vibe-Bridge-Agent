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
    systemdDir: overrideSystemdDir
  } = opts || {};
  const { projects, github, systemd, hostfs, capacityAdapters, bundle } = adapters;

  if (!projectId || !lane) throw new Error('MISSING_PROJECT_OR_LANE');

  const sysDir = overrideSystemdDir || process.env.SYSTEMD_DIR || (process.env.CI ? '/tmp/systemd-units' : '/etc/systemd/system');

  // log helper
  const laneDir = `${projectsBase}/${projectId}/${lane}`;
  const logPath = `${laneDir}/install.log`;
  async function log(line){
    try {
      await hostfs.mkdirp(laneDir, 0o750);
      const fs = await import('node:fs/promises');
      const prev = await fs.readFile(logPath, 'utf-8').catch(()=>''); 
      await fs.writeFile(logPath, prev + `[${new Date().toISOString()}] ${line}\n`);
      await fs.chmod(logPath, 0o640);
    } catch {}
  }

  // 1) Capacity gate
  const cap = await checkCapacity({ projectId, lane, desiredPorts }, capacityAdapters);
  if (!cap.ok) return cap;

  // 2) Resolve project owner/repo
  const project = projects.get(projectId);
  const { owner, repo } = pickOwnerRepo(project);
  if (!owner || !repo) return { ok:false, code:'PROJECT_NOT_BOUND', hint:'Bind repo_owner/repo_name first' };

  // 3) Idempotence
  const { root } = resolveLayout({ projectId, lane, rootBase });
  const unitName = `github-runner@${projectId}-${lane}.service`;
  const unitPath = `${sysDir}/${unitName}`;
  const unitExists = await (systemd.hasUnitFile ? systemd.hasUnitFile(unitPath) : false);
  const already = await (github.runnerExists ? github.runnerExists({ name: `${projectId}-${lane}` }) : false);
  if (unitExists && already && !replace){
    await log('idempotent skip: unit exists and runner registered');
    return { ok:true, skipped:true, unit: unitPath, compose_project: cap.compose_project };
  }

  // 4) Token
  let token;
  try {
    const tokenResp = await github.getRunnerRegistrationTokenForProject(projectId);
    token = tokenResp?.token;
  } catch (e){
    return { ok:false, code:'E_TOKEN_MINT_FAILED', hint: String(e && e.message || e) };
  }
  if (!token) return { ok:false, code:'E_TOKEN_MINT_FAILED', hint:'No token from broker' };

  // 5) Bundle
  try {
    if (hostfs && typeof hostfs.mkdirp === 'function') { await hostfs.mkdirp(root, 0o755); }
    if (bundle && typeof bundle.installBundle === 'function' && (bundlePath || bundleUrl)){
      await bundle.installBundle({ bundlePath, destDir: root });
    }
    if (hostfs && typeof hostfs.chownr === 'function') { await hostfs.chownr(root, 1000, 1000); }
  } catch (e){
    return { ok:false, code:'E_BUNDLE_INSTALL_FAILED', hint: String(e && e.message || e) };
  }

  // 6) Unit write
  let plan;
  try {
    plan = planProvision({ projectId, lane, owner, repo, token, rootBase, systemdDir: sysDir });
    const unit = plan.files[0];
    await systemd.writeUnit({ path: unit.path, content: unit.content });
  } catch (e){
    return { ok:false, code:'E_SYSTEMD_WRITE_FAILED', hint: String(e && e.message || e) };
  }

  // 7) Enable
  try {
    await systemd.daemonReload();
    await systemd.enableNow(unitName);
  } catch (e){
    return { ok:false, code:'E_SYSTEMD_ENABLE_FAILED', hint: String(e && e.message || e) };
  }

  await log('install complete');
  return { ok:true, unit: unitPath, labels: plan.labels, compose_project: cap.compose_project };
}
