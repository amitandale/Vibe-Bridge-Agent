
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, resolve, sep, dirname } from 'node:path';

/** --------------- helpers --------------- **/
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
    const entries = await fs.readdir(dir, { withFileTypes: true });
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
  const full = resolve(root, rel);
  const r = resolve(root);
  if (!full.startsWith(r + sep) && full !== r) throw new Error('PATH_ESCAPE_BLOCKED');
  return full;
}

/** robust glob → regex (supports **, *, ?) */
function globToRegex(glob) {
  const g = String(glob).replace(/\\/g, '/');
  let re = '^';
  for (let i=0; i<g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i+1] === '*') {
        i++;
        if (g[i+1] === '/') { i++; re += '(?:.*/)?'; }
        else re += '.*';
      } else {
        re += '[^/]*';
      }
      continue;
    }
    if (c === '?') { re += '[^/]'; continue; }
    if ('\.[]{}()+-^$|'.includes(c)) { re += '\\' + c; continue; }
    re += c;
  }
  re += '$';
  return new RegExp(re);
}

function isTestFile(relPath) {
  const p = relPath.split('\\').join('/');
  return p.startsWith('tests/') && p.endsWith('.mjs');
}

async function expandGlob(projectRoot, glob) {
  const regex = globToRegex(glob);
  const files = await listFilesRec(projectRoot);
  const rels = files.map(f => f.slice(projectRoot.length + (projectRoot.endsWith(sep) ? 0 : 1)).split('\\').join('/'));
  return rels.filter(r => regex.test(r));
}

/** --------------- public runners --------------- **/
export async function runNodeTestPattern({ projectRoot, pattern, timeoutMs=60000 }) {
  // Expand, then filter to test files only to avoid parsing non-code
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

/** --------------- Tool Broker --------------- **/
export function createToolBroker({ projectRoot, prefer='node', timeoutMs=60000, maxReadBytes=512*1024 } = {}) {
  const isAllowed = (cmd, args=[]) => {
    const c = String(cmd);
    if (c === 'node' && args[0] === '--test') return true;
    if (c === 'npm' && args[0] === 'test') return true;
    return false;
  };

  return {
    root: projectRoot,

    // Minimal jail utilities expected by tests
    async read(rel) {
      const full = jailPath(projectRoot, rel);
      const stat = await fs.stat(full);
      if (stat.size > maxReadBytes) throw new Error('FILE_TOO_LARGE');
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
      const matches = await expandGlob(projectRoot, pattern);
      return matches;
    },

    async bash(/*cmd, args*/) {
      // For security tests: disallow by default
      throw new Error('DISALLOWED_COMMAND');
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
