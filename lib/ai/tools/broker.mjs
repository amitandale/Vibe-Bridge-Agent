/**
 * bridge-agent/lib/ai/tools/broker.mjs
 * ToolBroker: jailed FS utilities (read/ls/grep) + minimal bash allow-list.
 * - All paths resolve relative to a single baseDir (projectRoot/root/cwd).
 * - Absolute paths are permitted only if they are inside baseDir.
 * - Enforces FILE_TOO_LARGE on read() before loading into memory.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_MAX_READ = 512 * 1024; // 512 KiB
const ALLOW_CMDS = new Set(['ls', 'grep', 'cat']); // minimal allowlist for tests

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
    if (!within(base, candidate)) {
      throw err('PATH_ESCAPE', 'PATH_ESCAPE_BLOCKED');
    }
  } else {
    candidate = path.resolve(base, input);
    if (!within(base, candidate)) {
      throw err('PATH_ESCAPE', 'PATH_ESCAPE_BLOCKED');
    }
  }
  return candidate;
}

async function statWithin(baseDir, userPath) {
  const full = resolveWithin(baseDir, userPath);
  return { st: await fs.stat(full), full };
}

export function createToolBroker(opts = {}) {
  let {
    projectRoot = undefined,
    root = undefined,
    timeoutMs = 60_000,
    maxReadBytes = DEFAULT_MAX_READ,
  } = opts;

  // Accept legacy { root } and prefer explicit { projectRoot }.
  const baseDir = normalizeBase(projectRoot || root || process.cwd());

  async function read(userPath) {
    const { st, full } = await statWithin(baseDir, userPath);
    if (!st.isFile()) throw err('EISDIR', 'READ_PATH_IS_NOT_FILE');
    if (st.size > maxReadBytes) throw err('FILE_TOO_LARGE', 'FILE_TOO_LARGE');
    return fs.readFile(full, 'utf8');
  }

  async function ls(userPath = '.') {
    const { st, full } = await statWithin(baseDir, userPath);
    if (!st.isDirectory()) {
      return [{ name: path.basename(full), type: 'file' }];
    }
    const ents = await fs.readdir(full, { withFileTypes: true });
    return ents.map(d => ({ name: d.name, type: d.isDirectory() ? 'dir' : 'file' }));
  }

  async function grep(userPath, pattern) {
    const { full } = await statWithin(baseDir, userPath);
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
    // Validate args don't escape; absolute args must be within baseDir
    for (const a of args) {
      if (typeof a === 'string' && path.isAbsolute(a)) {
        resolveWithin(baseDir, a); // throws if escape
      }
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
