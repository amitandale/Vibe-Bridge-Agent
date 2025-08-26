/**
 * lib/ai/orchestrator/selfreview.mjs
 * Deterministic self-review runner used by tests.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function changedFilesToTestPatterns(changed = []) {
  const uniq = new Set();
  for (const f of changed) {
    const base = path.basename(String(f)).replace(/\.mjs$/i, '');
    if (base) uniq.add(base);
  }
  const bases = Array.from(uniq);
  return bases.length ? bases.map(b => `tests/**/*${b}*.mjs`) : ['tests/**/*.mjs'];
}

async function listTestsRecursively(root) {
  const out = [];
  const q = [path.join(root, 'tests')];
  while (q.length) {
    const d = q.shift();
    let ents = [];
    try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) q.push(full);
      else if (e.isFile() && e.name.endsWith('.mjs')) out.push(full);
    }
  }
  return out;
}

function matchBySubstring(files, pattern) {
  // pattern looks like tests/**/*<base>*.mjs → we just require <base> substring
  const m = pattern.match(/\*+([^*]+)\*+\.mjs$/);
  if (!m) return files;
  const needle = m[1];
  return files.filter(f => f.includes(needle));
}

async function expandPatternsToFiles(cwd, patterns) {
  const all = await listTestsRecursively(cwd);
  if (!patterns || !patterns.length) return all;
  const picked = new Set();
  for (const p of patterns) {
    for (const f of matchBySubstring(all, p)) picked.add(f);
  }
  const out = Array.from(picked);
  return out.length ? out : all;
}

function runNodeTests({ cwd, files }) {
  return new Promise((resolve) => {
    const args = ['--test', ...files];
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function detectMissingExport(stderr) {
  // Match both Node ESM styles
  // 1) "does not provide an export named 'X'"
  // 2) "Named export 'X' not found"
  let m = stderr.match(/does not provide an export named '([^']+)'/i);
  if (m) return m[1];
  m = stderr.match(/Named export '([^']+)' not found/i);
  if (m) return m[1];
  return null;
}

async function findDefiningFile(cwd, symbol, changedFiles = []) {
  // Prefer changed files
  for (const rel of changedFiles) {
    if (!rel.endsWith('.mjs')) continue;
    const full = path.resolve(cwd, rel);
    try {
      const src = await fs.readFile(full, 'utf8');
      if (new RegExp(`\\b(function|const|let|var)\\s+${symbol}\\b`).test(src)) {
        return full;
      }
    } catch {}
  }
  // Fallback: scan lib/**/*.mjs
  const root = path.join(cwd, 'lib');
  const q = [root];
  while (q.length) {
    const d = q.shift();
    let ents = [];
    try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) q.push(full);
      else if (e.isFile() && e.name.endsWith('.mjs')) {
        try {
          const src = await fs.readFile(full, 'utf8');
          if (new RegExp(`\\b(function|const|let|var)\\s+${symbol}\\b`).test(src)) return full;
        } catch {}
      }
    }
  }
  return null;
}

async function appendNamedExport(filePath, symbol) {
  const src = await fs.readFile(filePath, 'utf8');
  if (new RegExp(`export\\s*\\{\\s*${symbol}\\s*\\}`).test(src)) return false;
  const out = src.replace(/\s*$/, '') + `\\nexport { ${symbol} };\\n`;
  await fs.writeFile(filePath, out, 'utf8');
  return true;
}

export async function selfReview({ projectRoot, changedFiles = [], profile = process.env.PROFILE || 'longrun' } = {}) {
  const cwd = projectRoot || process.cwd();
  const patterns = changedFilesToTestPatterns(changedFiles);
  const files = await expandPatternsToFiles(cwd, patterns);

  const first = await runNodeTests({ cwd, files });
  if (first.code === 0) {
    return { ok: true, retried: false, testsRun: patterns, summary: 'green' };
  }

  const missing = detectMissingExport(first.stderr || '');
  if (missing) {
    const target = await findDefiningFile(cwd, missing, changedFiles);
    if (target) {
      const changed = await appendNamedExport(target, missing);
      if (changed) {
        const rerunFiles = await expandPatternsToFiles(cwd, patterns);
        const second = await runNodeTests({ cwd, files: rerunFiles });
        if (second.code === 0) {
          return {
            ok: true,
            retried: true,
            fix: { kind: 'missing-export', file: path.relative(cwd, target), symbol: missing },
            testsRun: patterns,
            summary: 'fixed missing export'
          };
        }
        // still failing after fix → report as non-trivial
        const failText = (second.stderr || second.stdout || '').slice(0, 2000);
        return { ok: false, code: 'CHECKS_FAILED', retried: true, fix: { kind: 'missing-export' }, testsRun: patterns, summary: failText };
      }
    }
  }

  const summary = (first.stderr || first.stdout || '').slice(0, 2000);
  return { ok: false, code: 'CHECKS_FAILED', retried: false, testsRun: patterns, summary };
}
