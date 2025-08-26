import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { resolve, join, sep, basename } from 'node:path';

/**
 * Ensure a path is inside root and return absolute path.
 */
function jailPath(root, rel) {
  const abs = resolve(root, rel);
  const rootAbs = resolve(root);
  if (!abs.startsWith(rootAbs + sep) && abs !== rootAbs) {
    const err = new Error('PATH_ESCAPE');
    err.code = 'PATH_ESCAPE';
    throw err;
  }
  return abs;
}

async function statSafe(p) {
  try { return await fs.stat(p); } catch { return null; }
}

async function listFilesRec(dir) {
  const out = [];
  async function walk(d) {
    const ents = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of ents) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(p);
    }
  }
  await walk(dir);
  return out;
}

function globToRegex(glob) {
  // Very small glob -> regex: supports **, *, ?, and escapes .
  let rx = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '.') { rx += '\\.'; i++; continue; }
    if (c === '?') { rx += '[^/\\' + sep + ']'; i++; continue; }
    if (c === '*') {
      if (glob[i+1] === '*') { rx += '.*'; i += 2; continue; }
      rx += '[^/\\' + sep + ']*'; i++; continue;
    }
    if ('+()[]{}^$|'.includes(c)) { rx += '\\' + c; i++; continue; }
    rx += c;
    i++;
  }
  rx += '$';
  return new RegExp(rx);
}

function runProc(cmd, args, { cwd, timeoutMs = 60000 } = {}) {
  return new Promise((resolveP) => {
    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '', err = '';
    let timedOut = false;
    const to = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch {}
    }, timeoutMs);
    child.stdout.on('data', d => { out += String(d); });
    child.stderr.on('data', d => { err += String(d); });
    child.on('close', (code) => {
      clearTimeout(to);
      resolveP({ code, stdout: out, stderr: err, timedOut });
    });
  });
}

/**
 * Public helper (also imported by selfreview)
 * Spawns Node's built-in test runner with expanded file list.
 * Avoids passing raw globs (which can cause "Unexpected token '*'").
 */
export async function runNodeTestPattern({ projectRoot, pattern, timeoutMs = 60000 }) {
  const root = resolve(projectRoot);
  const all = await listFilesRec(root);
  const rx = globToRegex(pattern.replace(/^[.\\/]+/, '')); // normalize
  const matches = all
    .filter(p => p.endsWith('.mjs') || p.endsWith('.js'))
    .filter(p => rx.test(p.replace(root + sep, '')));
  if (matches.length === 0) {
    // Nothing to run: treat as success to avoid spurious failures.
    return { code: 0, stdout: '', stderr: '' };
  }
  const args = ['--test', ...matches];
  return await runProc(process.execPath, args, { cwd: root, timeoutMs });
}

export function createToolBroker({
  root,
  maxReadBytes = 512 * 1024,
  timeoutMs = 60000,
  bashAllowList = ['node', 'npm', 'pnpm', 'echo']
} = {}) {
  const projectRoot = resolve(root);
  async function ls(rel='.'){
    const p = jailPath(projectRoot, rel);
    const ents = await fs.readdir(p, { withFileTypes: true });
    return await Promise.all(ents.map(async e => {
      const sp = join(p, e.name);
      const st = await fs.stat(sp).catch(() => null);
      return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', size: st ? st.size : 0 };
    }));
  }
  async function read(rel){
    const p = jailPath(projectRoot, rel);
    const st = await statSafe(p);
    if (!st) { const e = new Error(`ENOENT: no such file or directory, stat '${p}'`); e.code = 'ENOENT'; throw e; }
    if (st.size > maxReadBytes) { const e = new Error('FILE_TOO_LARGE'); e.code = 'FILE_TOO_LARGE'; throw e; }
    return fs.readFile(p, 'utf8');
  }
  async function grep(needle, rel='.') {
    const start = jailPath(projectRoot, rel);
    const files = await listFilesRec(start);
    const out = [];
    for (const f of files) {
      const txt = await fs.readFile(f, 'utf8').catch(() => '');
      const lines = txt.split(/\r?\n/);
      for (let i=0;i<lines.length;i++) {
        if (lines[i].includes(needle)) {
          out.push({ file: f, lineno: i+1, line: lines[i] });
        }
      }
    }
    return out;
  }
  function isAllowed(cmd /*, args*/) {
    return bashAllowList.includes(cmd);
  }
  async function bash(cmd, args = []) {
    if (!isAllowed(cmd)) { const e = new Error('BASH_CMD_NOT_ALLOWED'); e.code = 'BASH_CMD_NOT_ALLOWED'; throw e; }
    return runProc(cmd, args, { cwd: projectRoot, timeoutMs });
  }

  return {
    ls,
    read,
    grep,
    bash,
    async run(cmd, args = [], opts = {}) {
      if (!isAllowed(cmd)) { const e = new Error('DISALLOWED_COMMAND'); e.code = 'DISALLOWED_COMMAND'; throw e; }
      return runProc(cmd, args, { cwd: projectRoot, timeoutMs: opts.timeoutMs || timeoutMs });
    },
    async runTestPattern(pattern) {
      return runNodeTestPattern({ projectRoot, pattern, timeoutMs });
    }
  };
}
