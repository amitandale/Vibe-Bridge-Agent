import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, sep } from 'node:path';

function runProc(cmd, args, { cwd, timeoutMs=60000 } = {}) {
  return new Promise((resolveP) => {
    const child = spawn(cmd, args, { cwd, env: process.env, stdio: ['ignore','pipe','pipe'] });
    let out = '', err = '';
    let killed = false;
    const to = setTimeout(() => { killed = true; try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    child.stdout.on('data', d => out += String(d));
    child.stderr.on('data', d => err += String(d));
    child.on('close', (code) => {
      clearTimeout(to);
      resolveP({ code, stdout: out, stderr: err, timedOut: killed });
    });
  });
}

function globEscapeRegex(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}
function globToRegex(glob) {
  let g = String(glob).split('\\').join('/');
  g = globEscapeRegex(g);
  g = g.replace(/\\\*\\\*\\\//g, '(?:.*/)?');
  g = g.replace(/\\\*\\\*/g, '.*');
  g = g.replace(/\\\*/g, '[^/]*');
  return new RegExp('^' + g + '$');
}

async function listFilesRec(rootDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else {
        out.push(full);
      }
    }
  }
  await walk(rootDir);
  return out;
}

function isTestFile(relPath) {
  const p = relPath.split('\\').join('/');
  return p.startsWith('tests/') && p.endsWith('.mjs');
}

async function expandGlob(projectRoot, glob) {
  const regex = globToRegex(glob);
  const files = await listFilesRec(projectRoot);
  const rels = files.map(f => f.slice(projectRoot.length + (projectRoot.endsWith(sep) ? 0 : 1)).split('\\').join('/'));
  return rels.filter(r => regex.test(r)).filter(isTestFile);
}

export async function runNodeTestPattern({ projectRoot, pattern, timeoutMs=60000 }) {
  const files = await expandGlob(projectRoot, pattern);
  if (!files.length) {
    return { code: 0, stdout: '', stderr: '' };
  }
  const args = ['--test', ...files];
  return await runProc('node', args, { cwd: projectRoot, timeoutMs });
}

export async function runNpmTestPattern({ projectRoot, pattern, timeoutMs=60000 }) {
  const files = await expandGlob(projectRoot, pattern);
  if (!files.length) return { code: 0, stdout: '', stderr: '' };
  const args = ['test', '--', ...files];
  return await runProc('npm', args, { cwd: projectRoot, timeoutMs });
}

export function createToolBroker({ projectRoot, prefer='node', timeoutMs=60000 } = {}) {
  const isAllowed = (cmd, args=[]) => {
    const c = String(cmd);
    if (c === 'node' && args[0] === '--test') return true;
    if (c === 'npm' && args[0] === 'test') return true;
    return false;
  };
  return {
    isAllowed,
    async runTestPattern(pattern) {
      return prefer === 'node'
        ? runNodeTestPattern({ projectRoot, pattern, timeoutMs })
        : runNpmTestPattern({ projectRoot, pattern, timeoutMs });
    },
    async run(cmd, args=[], opts={}) {
      if (!isAllowed(cmd, args)) {
        return { code: 1, stdout: '', stderr: 'DISALLOWED_COMMAND' };
      }
      if (cmd === 'node' && args[0] === '--test') {
        return runProc('node', args, { cwd: projectRoot, timeoutMs: opts.timeoutMs || timeoutMs });
      }
      if (cmd === 'npm' && args[0] === 'test') {
        return runProc('npm', args, { cwd: projectRoot, timeoutMs: opts.timeoutMs || timeoutMs });
      }
      return { code: 1, stdout: '', stderr: 'DISALLOWED_COMMAND' };
    }
  };
}