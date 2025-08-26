
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, resolve, sep, basename } from 'node:path';

/** Run a child process and collect output */
function runProc(cmd, args, { cwd, timeoutMs = 60000 } = {}) {
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

/** Ensure path stays within jail root */
function resolveWithin(root, relPath) {
  const abs = resolve(root, relPath);
  const normRoot = resolve(root) + sep;
  if (!(abs + sep).startsWith(normRoot) && abs !== resolve(root)) {
    // Attempted path traversal
    const e = new Error('PATH_ESCAPE');
    e.code = 'PATH_ESCAPE';
    throw e;
  }
  return abs;
}

async function statWithin(root, relPath) {
  const p = resolveWithin(root, relPath);
  return await fs.stat(p);
}

async function readFileWithin(root, relPath, maxBytes = 512 * 1024) {
  const p = resolveWithin(root, relPath);
  const st = await fs.stat(p);
  if (st.size > maxBytes) {
    const e = new Error('FILE_TOO_LARGE');
    e.code = 'FILE_TOO_LARGE';
    throw e;
  }
  return await fs.readFile(p, 'utf8');
}

async function listDirWithin(root, relDir = '.') {
  const dir = resolveWithin(root, relDir);
  const ents = await fs.readdir(dir, { withFileTypes: true });
  return ents.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }));
}

async function grepWithin(root, needle, relDir='.') {
  const dir = resolveWithin(root, relDir);
  const results = [];
  async function walk(d) {
    const ents = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of ents) {
      const full = join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        try {
          const txt = await fs.readFile(full, 'utf8');
          if (txt.includes(needle)) {
            results.push({ file: full });
          }
        } catch {}
      }
    }
  }
  await walk(dir);
  return results;
}

/** Allow-list for bash commands */
const ALLOWED_CMDS = new Set([
  'echo','ls','cat','grep','wc','node','npm','pwd'
]);

function isAllowed(cmd /*, args */) {
  return ALLOWED_CMDS.has(basename(cmd));
}

export function createToolBroker({ root, timeoutMs = 60000, prefer = 'node', projectRoot = null } = {}) {
  const jailRoot = root || projectRoot || process.cwd();
  const projRoot = projectRoot || jailRoot;

  return {
    async ls(p='.') {
      return listDirWithin(jailRoot, p);
    },

    async read(p) {
      return readFileWithin(jailRoot, p);
    },

    async grep(needle, p='.') {
      return grepWithin(jailRoot, needle, p);
    },

    async bash(cmd, args = [], opts = {}) {
      if (!isAllowed(cmd, args)) {
        const e = new Error('BASH_CMD_NOT_ALLOWED');
        e.code = 'BASH_CMD_NOT_ALLOWED';
        throw e;
      }
      return runProc(cmd, args, { cwd: jailRoot, timeoutMs: opts.timeoutMs || timeoutMs });
    },

    async runTestPattern(pattern) {
      return prefer === 'node'
        ? runNodeTestPattern({ projectRoot: projRoot, pattern, timeoutMs })
        : runNpmTestPattern({ projectRoot: projRoot, pattern, timeoutMs });
    },

    async run(cmd, args = [], opts = {}) {
      if (!isAllowed(cmd, args)) throw new Error('DISALLOWED_COMMAND');
      return runProc(cmd, args, { cwd: projRoot, timeoutMs: opts.timeoutMs || timeoutMs });
    }
  };
}

/** -------- Test running helpers (used by orchestrator/selfreview) -------- */

function globToRegExp(glob) {
  // Very small glob -> regex: ** -> .*  * -> [^/]*  . -> \.
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '.') re += '\\.';
    else if (ch === '*') {
      if (glob[i+1] === '*') { re += '.*'; i++; }
      else re += '[^/]*';
    } else if (ch === '?') {
      re += '.';
    } else if (ch === '/') {
      re += '\\/';
    } else {
      re += ch.replace(/[|\\{}()[\]^$+]/g, '\\$&');
    }
  }
  re += '$';
  return new RegExp(re);
}

async function listFilesRec(root) {
  const acc = [];
  async function walk(d) {
    const ents = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of ents) {
      const full = join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else acc.push(full);
    }
  }
  await walk(root);
  return acc;
}

export function isTestFile(p) {
  const b = basename(p);
  return /test\.(mjs|js)$/.test(b);
}

export async function expandGlob(root, pattern) {
  // If pattern looks like a direct path, return it
  if (!pattern.includes('*')) {
    const p = resolve(root, pattern);
    try {
      const st = await fs.stat(p);
      if (st.isFile()) return [p];
    } catch {}
  }
  const files = await listFilesRec(root);
  const rex = globToRegExp(pattern.startsWith('./') ? pattern.slice(2) : pattern);
  return files.filter(f => rex.test(f.replace(resolve(root) + sep, '')));
}

export async function runNodeTestPattern({ projectRoot, pattern, timeoutMs = 60000 }) {
  const files = (await expandGlob(projectRoot, pattern)).filter(isTestFile);
  if (!files.length) return { code: 0, stdout: '', stderr: '' };
  const args = ['--test', ...files];
  return await runProc('node', args, { cwd: projectRoot, timeoutMs });
}

export async function runNpmTestPattern({ projectRoot, pattern, timeoutMs = 60000 }) {
  const files = (await expandGlob(projectRoot, pattern)).filter(isTestFile);
  if (!files.length) return { code: 0, stdout: '', stderr: '' };
  const args = ['test', '--', '--test', ...files];
  return await runProc('npm', args, { cwd: projectRoot, timeoutMs });
}
