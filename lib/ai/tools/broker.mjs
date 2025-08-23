import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { resolve, sep, join } from 'node:path';

const DEFAULT_MAX_READ_BYTES = 512 * 1024; // 512KB
const DEFAULT_MAX_GREP_BYTES = 256 * 1024; // 256KB

const SECRET_RX = new RegExp([
  'API_KEY','TOKEN','SECRET','PASSWORD','GITHUB_TOKEN','OPENAI_API_KEY','ANTHROPIC_KEY',
  'CLAUDE_API_KEY','N8N_TOKEN','SUPABASE','VERCEL_'
].join('|'), 'i');

function jailPath(root, p) {
  const abs = resolve(root, p || '');
  const normRoot = resolve(root);
  if (!abs.startsWith(normRoot + sep) && abs !== normRoot) {
    throw new Error('PATH_ESCAPE');
  }
  return abs;
}

async function safeRead(fp, maxBytes = DEFAULT_MAX_READ_BYTES) {
  const st = await fs.stat(fp);
  if (st.size > maxBytes) throw new Error('FILE_TOO_LARGE');
  return fs.readFile(fp, 'utf8');
}

function redact(s) {
  if (!s) return s;
  return String(s).replace(SECRET_RX, 'REDACTED');
}

export function createToolBroker({ root, allowBash = ['node','npm','pnpm','yarn','git'], timeoutMs = 90_000 }) {
  const repoRoot = resolve(root);
  return {
    async ls(rel = '.') {
      const abs = jailPath(repoRoot, rel);
      const items = await fs.readdir(abs, { withFileTypes: true });
      return items.map(d => ({ name: d.name, type: d.isDirectory() ? 'dir' : 'file' }));
    },
    async read(rel) {
      const abs = jailPath(repoRoot, rel);
      const txt = await safeRead(abs);
      return txt;
    },
    async grep(query, rel = '.') {
      const abs = jailPath(repoRoot, rel);
      const st = await fs.stat(abs);
      const results = [];
      const rx = query instanceof RegExp ? query : new RegExp(query || '', 'i');
      async function walk(dir) {
        const list = await fs.readdir(dir, { withFileTypes: true });
        for (const d of list) {
          const p = join(dir, d.name);
          if (d.isDirectory()) { await walk(p); }
          else {
            if (d.name.startsWith('.git')) continue;
            const txt = await safeRead(p, DEFAULT_MAX_GREP_BYTES).catch(() => null);
            if (!txt) continue;
            if (rx.test(txt)) results.push({ file: p.substring(repoRoot.length + 1) });
          }
        }
      }
      if (st.isDirectory()) await walk(abs);
      else {
        const txt = await safeRead(abs, DEFAULT_MAX_GREP_BYTES);
        if (rx.test(txt)) results.push({ file: rel });
      }
      return results;
    },
    async bash(cmd, args = [], opts = {}) {
      if (!allowBash.includes(cmd)) throw new Error('BASH_CMD_NOT_ALLOWED');
      const cwd = jailPath(repoRoot, opts.cwd || '.');
      return new Promise((resolveP, rejectP) => {
        const child = execFile(cmd, args, { cwd, timeout: timeoutMs }, (err, stdout, stderr) => {
          if (err) return rejectP(new Error(`BASH_FAILED: ${err.message}`));
          resolveP({ stdout: redact(stdout), stderr: redact(stderr) });
        });
      });
    }
  };
}
