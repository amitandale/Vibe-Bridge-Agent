// lib/workspace/docker.host.mjs

/** Extract compose project label from a Labels CSV line */
export function parseComposeProjectFromLabels(line){
  // labels are comma-separated key=value pairs
  for (const part of String(line||'').split(',')){
    const [k, v] = part.split('=');
    if ((k||'').trim() === 'com.docker.compose.project'){
      return (v||'').trim();
    }
  }
  return null;
}

/** Parse multiple label lines into a Set of compose project names */
export function extractComposeProjects(lines){
  const out = new Set();
  for (const ln of (Array.isArray(lines) ? lines : String(lines||'').split(/\r?\n/))){
    const p = parseComposeProjectFromLabels(ln);
    if (p) out.add(p);
  }
  return Array.from(out);
}
