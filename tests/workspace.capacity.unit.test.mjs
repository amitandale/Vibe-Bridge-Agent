// tests/workspace.capacity.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCapacity } from '../lib/workspace/capacity.mjs';

function baseAdapter(){
  return {
    fs: {
      async exists(){ return true; },
      async mkdir(){}, async chmod(){}, async stat(){ return { mode:0o750, uid:1000, gid:1000 }; },
      async statvfs(){ return { bavail: BigInt(50n * 1024n**3n / 4096n), frsize: 4096 }; },
    },
    sys: {
      async nproc(){ return 4; },
      async loadavg1(){ return 1.0; },
      async memAvailableBytes(){ return 8 * 1024**3; },
    },
    docker: {
      async ping(){ return true; },
      async composeActiveProjects(){ return []; },
    },
    net: {
      async listeningSockets(){ return []; },
    },
  };
}

test('cpu low triggers E_CPU_LOW', async () => {
  const a = baseAdapter();
  a.sys.nproc = async ()=>1;
  const r = await checkCapacity({ projectId:'p1', lane:'ci', desiredPorts:[] }, a);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_CPU_LOW');
});

test('cpu busy triggers E_CPU_BUSY', async () => {
  const a = baseAdapter();
  a.sys.nproc = async ()=>2;
  a.sys.loadavg1 = async ()=>4; // > nproc*1.5 = 3
  const r = await checkCapacity({ projectId:'p1', lane:'ci', desiredPorts:[] }, a);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_CPU_BUSY');
});

test('mem low triggers E_MEM_LOW', async () => {
  const a = baseAdapter();
  a.sys.memAvailableBytes = async ()=> 0.5 * 1024**3;
  const r = await checkCapacity({ projectId:'p1', lane:'ci', desiredPorts:[] }, a);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_MEM_LOW');
});

test('docker down triggers E_DOCKER_DOWN', async () => {
  const a = baseAdapter();
  a.docker.ping = async ()=> false;
  const r = await checkCapacity({ projectId:'p1', lane:'ci', desiredPorts:[] }, a);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_DOCKER_DOWN');
});

test('compose conflict triggers E_COMPOSE_CONFLICT', async () => {
  const a = baseAdapter();
  a.docker.composeActiveProjects = async ()=> ['p1-ci'];
  const r = await checkCapacity({ projectId:'p1', lane:'ci', desiredPorts:[] }, a);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_COMPOSE_CONFLICT');
});

test('port conflict returns correct shape', async () => {
  const a = baseAdapter();
  a.net.listeningSockets = async ()=> [{ port: 54322, proc: 'docker-proxy', compose_project: 'supabase-ci' }];
  const r = await checkCapacity({ projectId:'p1', lane:'ci', desiredPorts:[54322] }, a);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_PORT_CONFLICT');
  assert.equal(r.details.port, 54322);
  assert.equal(r.details.proc, 'docker-proxy');
  assert.equal(r.details.compose_project, 'supabase-ci');
  assert.ok(r.hint.includes('supabase-ci'));
});

test('clean host returns ok with compose project name', async () => {
  const a = baseAdapter();
  const r = await checkCapacity({ projectId:'p1', lane:'ci', desiredPorts:[54322] }, a);
  assert.equal(r.ok, true);
  assert.equal(r.compose_project, 'p1-ci');
});
