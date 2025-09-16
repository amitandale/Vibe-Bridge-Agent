// lib/workspace/capacity.mjs
// Aggregate capacity checks: CPU, memory, docker/compose, ports, plus FS via fs.mjs
import { composeProjectName, portConflict } from './ports.mjs';
import { checkFs } from './fs.mjs';

/** Top-level check. Returns { ok:true } or { ok:false, code, details, hint } */
export async function checkCapacity({ projectId, lane, desiredPorts=[] }, adapter, now = Date.now()/1000){
  if (String(process.env.CAPACITY_CHECKS_DISABLED||'').toLowerCase() === 'true'){
    return { ok:true, disabled:true };
  }
  // 1) FS
  const fsr = await checkFs({ projectId }, adapter);
  if (!fsr.ok) return fsr;

  // 2) CPU
  const nproc = await adapter.sys.nproc();
  const CAP_CPU_MIN = Number(process.env.CAP_CPU_MIN || 2);
  if (nproc < CAP_CPU_MIN){
    return { ok:false, code:'E_CPU_LOW', details:{ nproc, min: CAP_CPU_MIN }, hint:`Host has ${nproc} CPUs < ${CAP_CPU_MIN}` };
  }
  const load1 = await adapter.sys.loadavg1();
  const maxLoad = Number(process.env.CAP_CPU_MAX_LOAD || (nproc * 1.5));
  if (load1 > maxLoad){
    return { ok:false, code:'E_CPU_BUSY', details:{ load1, max_allowed: maxLoad }, hint:`1-min load ${load1} exceeds threshold ${maxLoad}` };
  }

  // 3) Memory
  const availB = await adapter.sys.memAvailableBytes();
  const CAP_MEM_MIN_GB = Number(process.env.CAP_MEM_MIN_GB || 2);
  const availGiB = availB / (1024**3);
  if (availGiB < CAP_MEM_MIN_GB){
    return { ok:false, code:'E_MEM_LOW', details:{ available_gb: Number(availGiB.toFixed(2)), required_gb: CAP_MEM_MIN_GB }, hint:`Available memory below ${CAP_MEM_MIN_GB} GiB` };
  }

  // 4) Docker
  const up = await adapter.docker.ping();
  if (!up){
    return { ok:false, code:'E_DOCKER_DOWN', details:{}, hint:'Docker daemon not responsive' };
  }
  const composeProject = composeProjectName(projectId, lane);
  const activeProjects = await adapter.docker.composeActiveProjects();
  if (activeProjects.includes(composeProject)){
    return { ok:false, code:'E_COMPOSE_CONFLICT', details:{ compose_project: composeProject }, hint:`Compose project '${composeProject}' already active` };
  }

  // 5) Ports
  const sockets = await adapter.net.listeningSockets();
  const desired = Array.from(new Set((desiredPorts||[]).map(n => Number(n)).filter(n => Number.isFinite(n))));
  for (const p of desired){
    const owner = sockets.find(s => Number(s.port) === p);
    if (owner){
      const ownerMeta = {};
      if (owner.proc) ownerMeta.proc = owner.proc;
      if (owner.compose_project) ownerMeta.compose_project = owner.compose_project;
      return portConflict(p, ownerMeta);
    }
  }

  return { ok:true, compose_project: composeProject };
}
