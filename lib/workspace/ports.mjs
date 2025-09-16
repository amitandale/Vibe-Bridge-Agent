// lib/workspace/ports.mjs
// Desired port computation and simple helpers

/** Normalize a list of ports from number|string|array inputs. */
export function normalizePorts(ports){
  if (ports == null) return [];
  const arr = Array.isArray(ports) ? ports : String(ports).split(',').map(x => x.trim()).filter(Boolean);
  return Array.from(new Set(arr.map(p => Number(p)).filter(n => Number.isFinite(n) && n > 0 && n < 65536)));
}

/** Compute default compose project name for a lane */
export function composeProjectName(projectId, lane){
  return `${projectId}-${lane}`;
}

/** Format a conflict object per contract */
export function portConflict(port, owner){
  const details = { port };
  if (owner?.proc) details.proc = owner.proc;
  if (owner?.compose_project) details.compose_project = owner.compose_project;
  const hint = owner?.compose_project
    ? `Stop project '${owner.compose_project}' or choose a different ${owner?.lane || 'lane'} port`
    : `Choose a different port or stop the owning process`;
  return { ok: false, code: 'E_PORT_CONFLICT', details, hint };
}
