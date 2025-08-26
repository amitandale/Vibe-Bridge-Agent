/**
 * bridge-agent/lib/ai/tools/broker.mjs
 * ToolBroker: jailed FS utilities (read/ls/grep) + minimal bash allow-list.
 * - Single, deterministic jail root (projectRoot | root | cwd).
 * - Absolute paths allowed only if inside jail.
 * - Grep avoids ENOENT bubbles by trying jailed fallbacks deterministically.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_MAX_READ = 512 * 1024; // 512 KiB
const ALLOW_CMDS = new Set(['ls', 'grep', 'cat']);

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function normalizeBase(p) {
  return path.resolve(p || process.cwd());
}

function within(baseDir, cand) {
  const base = normalizeBase(baseDir);
  const full = path.resolve(cand);
  if (full === base) return true;
  const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;
  return full.startsWith(baseWithSep);
}

function resolveWithin(baseDir, userPath) {
  const base = normalizeBase(baseDir);
  const input = userPath ? String(userPath) : '.';
  let candidate;
  if (path.isAbsolute(input)) {
    candidate = path.resolve(input);
  } else {
    candidate = path.resolve(base, input);
  }
  if (!within(base, candidate)) {
    throw err('PATH_ESCAPE', 'PATH_ESCAPE_BLOCKED');
  }
  return candidate;
}

async function statIfExists(p) {
  try {
    return await fs.stat(p);
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

async function findUniqueByBasename(baseDir, baseName) {
  const root = normalizeBase(baseDir);
  const q = [root];
  const matches = [];
  while (q.length && matches.length < 2) {
    const dir = q.shift();
    let ents;
    try {
      ents = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      // Ignore directories we cannot read; stay jail-safe
      continue;
    }
    for (const d of ents) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) q.push(full);
      else if (d.isFile() && d.name === baseName) matches.push(full);
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

export function createToolBroker(opts = {}) {
  let {
    projectRoot = undefined,
    root = undefined,
    timeoutMs = 60_000,
    maxReadBytes = DEFAULT_MAX_READ,
  } = opts;

  const baseDir = normalizeBase(projectRoot || root || process.cwd());

  async function read(userPath) {
    const full = resolveWithin(baseDir, userPath);
    const st = await fs.stat(full);
    if (!st.isFile()) throw err('EISDIR', 'READ_PATH_IS_NOT_FILE');
    if (st.size > maxReadBytes) throw err('FILE_TOO_LARGE', 'FILE_TOO_LARGE');
    return fs.readFile(full, 'utf8');
  }

  async function ls(userPath = '.') {
    const full = resolveWithin(baseDir, userPath);
    const st = await fs.stat(full);
    if (!st.isDirectory()) return [{ name: path.basename(full), type: 'file' }];
    const ents = await fs.readdir(full, { withFileTypes: true });
    return ents.map(d => ({ name: d.name, type: d.isDirectory() ? 'dir' : 'file' }));
  }

  async function grep(userPath, pattern) {
    const input = String(userPath);
    // Candidate A: userPath (absolute in-jail or relative)
    let full = resolveWithin(baseDir, input);
    let st = await statIfExists(full);

    // Candidate B: "<userPath>.txt" in jail
    if (!st) {
      const candTxt = resolveWithin(baseDir, input + '.txt');
      st = await statIfExists(candTxt);
      if (st && st.isFile()) full = candTxt;
    }

    // Candidate C: unique match by basename (recursive)
    if (!st) {
      const unique = await findUniqueByBasename(baseDir, path.basename(input));
      if (unique) {
        full = unique;
        st = await fs.stat(full);
      }
    }

    if (!st) throw err('ENOENT', `ENOENT: ${input} not found inside jail`);
    if (!st.isFile()) throw err('EISDIR', 'GREP_TARGET_IS_NOT_FILE');

    const content = await fs.readFile(full, 'utf8');
    const rx = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
    const lines = content.split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (rx.test(lines[i])) out.push({ number: i + 1, line: lines[i] });
    }
    return out;
  }

  async function bash(cmd, args = [], options = {}) {
    if (!ALLOW_CMDS.has(cmd)) throw err('CMD_BLOCKED', 'BASH_CMD_NOT_ALLOWED');
    for (const a of args) {
      if (typeof a === 'string' && path.isAbsolute(a)) resolveWithin(baseDir, a);
    }
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: baseDir,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve({ code, stdout, stderr });
        else reject(err('BASH_FAILED', `BASH_FAILED(${code})`));
      });
    });
  }

  return { baseDir, read, ls, grep, bash };
}
