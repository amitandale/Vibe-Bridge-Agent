
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/** ------------ low-level runner (no shell) ------------ */
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

/** ------------ robust glob → regex ------------
 * Supports: **, **/, *, ? (no character classes)
 * Escapes all regex metachars properly; avoids "Nothing to repeat".
 */
function globToRegex(glob) {
  const g = String(glob).replace(/\\/g, '/');
  let re = '^';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i+1] === '*') {
        // **
        i++;
        if (g[i+1] === '/') {
          // **/  ->  (?:.*/)?
          i++;
          re += '(?:.*/)?';
        } else {
          // **   ->  .*
          re += '.*';
        }
      } else {
        // * -> [^/]*
        re += '[^/]*';
      }
      continue;
    }
    if (c === '?') { re += '[^/]'; continue; }
    // Escape regex specials
    if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
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

/** ------------ public runners ------------ */
export async function runNodeTestPattern({ projectRoot, pattern, timeoutMs=60000 }) {
  // Expand to explicit files; only pass tests/**/*.mjs to the node runner.
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

/** ------------ Tool Broker (expected by tests) ------------ */
export function createToolBroker({ projectRoot, prefer='node', timeoutMs=60000, maxReadBytes=512*1024 } = {}) {
  const isAllowed = (cmd, args=[]) => {
    const c = String(cmd);
    if (c === 'node' && args[0] === '--test') return true;
    if (c === 'npm' && args[0] === 'test') return true;
    return false;
  };

  return {
    root: projectRoot,

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
      return await expandGlob(projectRoot, pattern);
    },

    async bash(/*cmd, args*/) {
      // Disallow by default; security tests expect a rejection
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
