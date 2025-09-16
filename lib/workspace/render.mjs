// lib/workspace/render.mjs
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve template path with fail-closed semantics:
 * - If templateFile is provided and missing -> throw TEMPLATE_NOT_FOUND.
 * - Else if templateDir is provided and missing docker-compose.yml -> throw TEMPLATE_NOT_FOUND.
 * - Else fall back to packaged asset path if present, else throw.
 */
export async function resolveTemplate({ templateFile, templateDir } = {}){
  if (templateFile) {
    try { await stat(templateFile); return templateFile; }
    catch {
      const err = new Error('TEMPLATE_NOT_FOUND');
      err.code = 'TEMPLATE_NOT_FOUND';
      throw err;
    }
  }
  if (templateDir) {
    const p = join(templateDir, 'docker-compose.yml');
    try { await stat(p); return p; }
    catch {
      const err = new Error('TEMPLATE_NOT_FOUND');
      err.code = 'TEMPLATE_NOT_FOUND';
      throw err;
    }
  }
  const u = new URL('../../assets/docker/docker-compose.yml', import.meta.url);
  try {
    await stat(fileURLToPath(u));
    return fileURLToPath(u);
  } catch {
    const err = new Error('TEMPLATE_NOT_FOUND');
    err.code = 'TEMPLATE_NOT_FOUND';
    throw err;
  }
}

/** Validate a port map object of shape { lane: { APP_PORT: number, ... }, ... }. Throws on conflicts. */
export function validatePortMap(ports){
  if (!ports || typeof ports !== 'object') throw new Error('BAD_PORT_MAP');
  const seen = new Map(); // hostPort -> 'lane/key'
  for (const [lane, map] of Object.entries(ports)){
    if (!map || typeof map !== 'object') throw new Error('BAD_PORT_MAP');
    const laneSeen = new Set();
    for (const [k, v] of Object.entries(map)){
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        const e = new Error('BAD_PORT');
        e.details = { lane, key: k, value: v };
        throw e;
      }
      if (laneSeen.has(n)) {
        const e = new Error('DUP_PORT_IN_LANE');
        e.details = { lane, port: n };
        throw e;
      }
      laneSeen.add(n);
      if (seen.has(n)){
        const e = new Error('PORT_CONFLICT');
        e.details = { conflict_with: seen.get(n), lane, port: n };
        throw e;
      }
      seen.set(n, `${lane}/${k}`);
    }
  }
  return true;
}

/** Render per-project workspace with lanes. Does not start containers. */
export async function renderWorkspace({
  projectId,
  destRoot = '/home/devops/projects',
  lanes = ['ci','staging','prod'],
  ports = { ci: { APP_PORT: 3001 }, staging: { APP_PORT: 3002 }, prod: { APP_PORT: 3003 } },
  env = {},
  templateFile,
  templateDir,
  now = () => Date.now(),
} = {}){
  if (!projectId) throw new Error('MISSING_PROJECT_ID');

  // Fail closed if explicit template missing; otherwise allow packaged asset
  const tplPath = await resolveTemplate({ templateFile, templateDir });
  const tpl = await readFile(tplPath, 'utf8');

  // Validate ports
  validatePortMap(ports);

  const projectRoot = join(destRoot, projectId);
  const meta = {
    project: projectId,
    generated_at: now(),
    lanes: {},
  };

  for (const lane of lanes){
    const laneDir = join(projectRoot, lane);
    await mkdir(laneDir, { recursive: true });

    const laneEnv = { PROJECT: projectId, LANE: lane, ...env, ...(ports[lane] || {}) };
    // .env
    const envLines = Object.entries(laneEnv)
      .map(([k,v]) => `${k}=${String(v)}`)
      .join('\n') + '\n';
    await writeFile(join(laneDir, '.env'), envLines);

    // docker-compose.yml — simple placeholder substitution
    let body = tpl
      .replaceAll('${PROJECT}', projectId)
      .replaceAll('${LANE}', lane);
    for (const [k,v] of Object.entries(laneEnv)){
      body = body.replaceAll(`\${${k}}`, String(v)).replaceAll(`__${k}__`, String(v));
    }
    await writeFile(join(laneDir, 'docker-compose.yml'), body);

    meta.lanes[lane] = { env: laneEnv, compose: 'docker-compose.yml' };
  }

  // projects.json at project root
  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(projectRoot, 'projects.json'), JSON.stringify(meta, null, 2));

  return { ok: true, projectRoot, lanes, tplPath };
}
