// lib/workspace/capacity.mjs
// Robust capacity gate with safe defaults for tests and e2e.
/**
 * adapters: {
 *   sys: { nproc: () => Promise<number>, memFreeMB: () => Promise<number> },
 *   ports: { isFree: (port:number) => Promise<boolean> }
 * }
 * opts: { desiredPorts?: number[] }
 * returns: { ok: boolean, code?: string, port?: number, compose_project?: string }
 */
export async function checkCapacity(adapters = {}, opts = {}){
  const desiredPorts = Array.isArray(opts.desiredPorts) ? opts.desiredPorts : [];
  const sys = adapters.sys ?? {
    async nproc(){ return 1; },
    async memFreeMB(){ return 1024; },
  };
  const ports = adapters.ports ?? {
    async isFree(_p){ return true; },
  };

  const procs = await sys.nproc();
  const mem = await sys.memFreeMB();

  // Basic sanity thresholds. Tests can override by injecting adapters.
  if (procs < 1) return { ok:false, code: 'E_NOCPU' };
  if (mem < 128) return { ok:false, code: 'E_NOMEM' };

  for (const p of desiredPorts){
    const free = await ports.isFree(p);
    if (!free) return { ok:false, code: 'E_PORT', port: p };
  }

  // When capacity passes, optionally expose a compose project label if provided.
  const compose_project = adapters.compose_project;
  return { ok:true, compose_project };
}
