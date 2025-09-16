// lib/workspace/net.host.mjs

/** Parse 'ss -lntp' output for listening TCP ports with pids and process names.
 * Returns [{ proto, port, pid, proc }]
 */
export function parseSsListeners(text){
  const out = [];
  const lines = String(text||'').split(/\r?\n/);
  for (const ln of lines){
    // Example: LISTEN 0 4096 0.0.0.0:8080 ... users:(("node",pid=1234,fd=23))
    if (!/LISTEN/.test(ln)) continue;
    const m = ln.match(/\s(\*|\d+\.\d+\.\d+\.\d+|\[::\]):(\d+)\s/);
    const pidm = ln.match(/pid=(\d+)/);
    const procm = ln.match(/users:\(\(\"?([^\",]+)\"?,pid=\d+/);
    if (m){
      const port = parseInt(m[2], 10);
      const pid = pidm ? parseInt(pidm[1], 10) : 0;
      const proc = procm ? procm[1] : '';
      out.push({ proto:'tcp', port, pid, proc });
    }
  }
  return out;
}

/** Attach compose project mapping using a provided map { pid -> compose_project } */
export function attachComposeProjects(listeners, pidToProject){
  return (listeners||[]).map(it => ({
    ...it,
    compose_project: pidToProject?.[String(it.pid)] || pidToProject?.[it.pid] || null
  }));
}
