// tests/runner.executor.e2e.smoke.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installRunner } from '../lib/runner/executor.mjs';

function tmpdir(){
  return fs.mkdtemp(path.join(os.tmpdir(), 'ba20b-'));
}

test('e2e smoke: installs from mocked bundle dir and enables unit', async () => {
  const rootBase = await tmpdir();
  const projectsBase = await tmpdir();
  // Prepare fake bundle dir with scripts
  const bundleDir = await tmpdir();
  await fs.writeFile(path.join(bundleDir, 'config.sh'), '#!/usr/bin/env bash\necho config\n');
  await fs.writeFile(path.join(bundleDir, 'runsvc.sh'), '#!/usr/bin/env bash\necho run\n');

  // Adapters
  const capacityAdapters = {
    fs: { async exists(){return true;}, async mkdir(){}, async chmod(){}, async stat(){ return { mode:0o750, uid:1000, gid:1000 }; }, async statvfs(){ return { bavail: 10_000_000n, frsize: 4096n }; } },
    sys: { async nproc(){ return 4; }, async loadavg1(){ return 0.5; }, async memAvailableBytes(){ return 8*1024**3; } },
    docker: { async ping(){ return true; }, async composeActiveProjects(){ return []; } },
    net: { async listeningSockets(){ return []; } },
  };
  const projects = { get(id){ return { id, repo_owner:'o', repo_name:'r' }; } };
  const github = { async getRunnerRegistrationTokenForProject(){ return { token:'ghr_test' }; }, async runnerExists(){ return false; } };
  const syscalls = [];
  const systemd = {
    async writeUnit({ path: unitPath, content }){ syscalls.push(['write', unitPath]); await fs.writeFile(unitPath, content); },
    async daemonReload(){ syscalls.push(['reload']); },
    async enableNow(name){ syscalls.push(['enable', name]); }
  };
  const hostfs = {
    async mkdirp(p, mode){ await fs.mkdir(p, { recursive: true }); await fs.chmod(p, mode); },
    async writeFile(p, content, mode){ await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, content); await fs.chmod(p, mode); },
    async chownr(){ return { ok:true, dryRun:true }; },
  };
  const bundle = await import('../lib/runner/bundle.mjs');

  const r = await installRunner(
    { projectId:'p1', lane:'ci', rootBase, projectsBase, bundlePath: bundleDir, systemdDir: path.join(rootBase, 'units') },
    { projects, github, systemd, hostfs, capacityAdapters, bundle }
  );

  assert.equal(r.ok, true);
  assert.ok(syscalls.find(x => x[0] === 'write'));
  assert.ok(syscalls.find(x => x[0] === 'reload'));
  assert.ok(syscalls.find(x => x[0] === 'enable'));
  // Ensure scripts copied
  const dest = path.join(rootBase, 'p1', 'ci');
  await fs.access(path.join(dest, 'config.sh'));
  await fs.access(path.join(dest, 'runsvc.sh'));
});
