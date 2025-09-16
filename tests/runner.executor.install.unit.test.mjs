// tests/runner.executor.install.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { installRunner } from '../lib/runner/executor.mjs';

function mkAdapters({ capOk=true }={}){
  const capacityAdapters = {
    fs: { async exists(){return true;}, async mkdir(){}, async chmod(){}, async stat(){return {mode:0o750,uid:1000,gid:1000}}, async statvfs(){return { bavail: 100n, frsize: 1024n }} },
    sys: { async nproc(){return 4}, async loadavg1(){return 0.5}, async memAvailableBytes(){return 8*1024**3} },
    docker: { async ping(){return true}, async composeActiveProjects(){return []} },
    net: { async listeningSockets(){return []} },
  };
  if (!capOk){
    capacityAdapters.sys.nproc = async ()=>1;
  }
  const projects = {
    get(id){ return { id, repo_owner: 'o', repo_name: 'r' }; }
  };
  const github = {
    async getRunnerRegistrationTokenForProject(){ return { token: 'ghr_abc' }; }
  };
  const calls = [];
  const systemd = {
    async writeUnit({ path, content }){ calls.push(['write', path]); },
    async daemonReload(){ calls.push(['reload']); },
    async enableNow(name){ calls.push(['enable', name]); },
  };
  return { projects, github, systemd, fsAdapter: {}, capacityAdapters, calls };
}

test('capacity gate blocks install', async () => {
  const ad = mkAdapters({ capOk:false });
  const r = await installRunner({ projectId:'p1', lane:'ci' }, ad);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_CPU_LOW');
});

test('successful install writes unit and enables service', async () => {
  const ad = mkAdapters({ capOk:true });
  const r = await installRunner({ projectId:'p1', lane:'ci' }, ad);
  assert.equal(r.ok, true);
  assert.equal(Array.isArray(ad.calls), true);
  const ops = ad.calls.map(x=>x[0]);
  assert.deepEqual(ops, ['write','reload','enable']);
});
