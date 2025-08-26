import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, resolve, sep, basename } from 'node:path';

function runProc(cmd, args, { cwd, timeoutMs=60000 } = {}) {
  return new Promise((resolveP) => {
    const child = spawn(cmd, args, { cwd, env: process.env, stdio: ['ignore','pipe','pipe'] });
    let out = '', err = '';
    let killed = false;
    const to = setTimeout(() => { killed = true; try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    child.stdout.on('data', d => out += String(d));
    child.stderr.on('data', d => err += String(d));
    child.on('close', (code) => { clearTimeout(to); resolveP({ code, stdout: out, stderr: err, timedOut: killed }); });
  });
}

async function listFilesRec(rootDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(rootDir);
  return out;
}

function jailPath(root, rel) {
  if (!root) throw new Error('PATH_ESCAPE');
  const full = resolve(root, rel ?? '');
  const r = resolve(root);
  if (!full.startsWith(r + sep) && full !== r) throw new Error('PATH_ESCAPE');
  return full;
}

// Robust glob → regex (supports **, **/, *, ?)
function globToRegex(glob) {
  const g = String(glob).replace(/\\/g, '/');
  let re = '^';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i+1] === '*') { // '**'
        i++;
        if (g[i+1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else {
        re += '[^/]*';
      }
      continue;
    }
    if (c === '?') { re += '[^/]'; continue; }
    if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c; else re += c;
  }
  re += '$';
  return new RegExp(re);
}

function relFromRoot(projectRoot, fullPath) {
  const prefix = projectRoot.endsWith(sep) ? projectRoot : projectRoot + sep;
  const rel = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
  return rel.split('\\').join('/');
}

async function expandGlob(projectRoot, pattern) {
  const regex = globToRegex(pattern);
  const files = await listFilesRec(projectRoot);
  const rels = files.map(f => relFromRoot(projectRoot, f));
  return rels.filter(r => regex.test(r));
}

function isTestFile(relPath) {
  const p = relPath.split('\\').join('/');
  return p.startsWith('tests/') && p.endsWith('.mjs');
}

async function statWithin(projectRoot, rel) {
  const relNorm = String(rel || '');
  // Try exact relative, then find by basename under tests/** (e.g., tests/fixtures/big.txt)
  const attempts = [ relNorm ];
  let lastErr;
  for (const attempt of attempts) {
    try {
      const full = jailPath(projectRoot, attempt);
      const st = await fs.stat(full);
      return { st, full };
    } catch (e) {
      lastErr = e;
      if (e && e.code !== 'ENOENT') throw e;
    }
  }
  // Basename search (only under tests/** to stay jailed)
  const base = basename(relNorm);
  const all = await listFilesRec(projectRoot);
  for (const f of all) {
    const relF = relFromRoot(projectRoot, f);
    if (!relF.startsWith('tests/')) continue;
    if (basename(relF) === base) {
      const st = await fs.stat(f);
      return { st, full: f };
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('ENOENT');
}

export async function runNodeTestPattern({ projectRoot, pattern, timeoutMs=60000 }) {
  const files = (await expandGlob(projectRoot, pattern)).filter(isTestFile);
  if (!files.length) return { code: 0, stdout: '', stderr: '' };
  const args = ['--test', ...files];
  return await runProc('node', args, { cwd: projectRoot, timeoutMs });
}

export async function runNpmTestPattern({ projectRoot, pattern, timeoutMs=60000 }) {
  const files = (await expandGlob(projectRoot, pattern)).filter(isTestFile);
  if (!files.length) return { code: 0, stdout: '', stderr: '' };
  const args = ['test', '--', ...files];
  return await runProc('npm', args, { cwd: projectRoot, timeoutMs });
}

export function createToolBroker({ projectRoot = process.cwd(), prefer='node', timeoutMs=60000, maxReadBytes=512*1024 } = {}) {
  const isAllowed = (cmd, args=[]) => {
    const c = String(cmd);
    if (c === 'node' && args[0] === '--test') return true;
    if (c === 'npm' && args[0] === 'test') return true;
    return false;
  };

  return {
    root: projectRoot,

    async read(rel) {
      const { st, full } = await statWithin(projectRoot, rel);
      if (st.size > maxReadBytes) throw new Error('FILE_TOO_LARGE');
      return await fs.readFile(full, 'utf8');
    },

    async ls(rel='.') {
      const full = jailPath(projectRoot, rel);
      const ents = await fs.readdir(full, { withFileTypes: true });
      return ents.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }));
    },

    async grep(rel, needle) {
      const text = await this.read(rel);
      const lines = text.split('\n');
      const rx = new RegExp(needle);
      return lines.filter(l => rx.test(l));
    },

    async glob(pattern) {
      return await expandGlob(projectRoot, pattern);
    },

    async bash(/*cmd, args*/) {
      throw new Error('BASH_CMD_NOT_ALLOWED');
    },

    async runTestPattern(pattern) {
      return prefer === 'node'
        ? runNodeTestPattern({ projectRoot, pattern, timeoutMs })
        : runNpmTestPattern({ projectRoot, pattern, timeoutMs });
    },

    async run(cmd, args=[], opts={}) {
      if (!isAllowed(cmd, args)) throw new Error('DISALLOWED_COMMAND');
      return runProc(cmd, args, { cwd: projectRoot, timeoutMs: opts.timeoutMs || timeoutMs });
    }
  };
}
