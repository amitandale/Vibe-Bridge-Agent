// tests/workspace.capacity.integration.mock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCapacity } from '../lib/workspace/capacity.mjs';

function mkAdapter({ dockerUp=true, activeProjects=[], sockets=[] }={}){
  return {
    fs: {
      async exists(){ return true; },
      async mkdir(){}, async chmod(){}, async stat(){ return { mode:0o750, uid:1000, gid:1000 }; },
      async statvfs(){ return { bavail: BigInt(100n * 1024n**3n / 4096n), frsize: 4096 }; },
    },
    sys: {
      async nproc(){ return 8; },
      async loadavg1(){ return 1.0; },
      async memAvailableBytes(){ return 16 * 1024**3; },
    },
    docker: {
      async ping(){ return dockerUp; },
      async composeActiveProjects(){ return activeProjects; },
    },
    net: {
      async listeningSockets(){ return sockets; },
    },
  };
}

test('docker down path returns actionable code and hint', async () => {
  const r = await checkCapacity({ projectId:'pX', lane:'ci', desiredPorts:[54321] }, mkAdapter({ dockerUp:false }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_DOCKER_DOWN');
  assert.ok(r.hint.includes('Docker'));
});

test('port conflict yields owning compose project name', async () => {
  const r = await checkCapacity({ projectId:'pY', lane:'ci', desiredPorts:[54322] }, mkAdapter({ sockets:[{ port:54322, proc:'docker-proxy', compose_project:'supabase-ci' }] }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E_PORT_CONFLICT');
  assert.equal(r.details.port, 54322);
  assert.equal(r.details.compose_project, 'supabase-ci');
});
