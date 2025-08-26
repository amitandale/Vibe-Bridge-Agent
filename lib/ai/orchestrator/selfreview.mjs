/**
 * lib/ai/orchestrator/selfreview.mjs
 * Self-review orchestrator used by tests.
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
  // If no changed files, run all tests
  const bases = Array.from(uniq);
  return bases.length ? bases.map(b => `tests/**/*${b}*.mjs`) : ['tests/**/*.mjs'];
}

function runNodeTests({ cwd, patterns }) {
  return new Promise((resolve) => {
    const args = ['--test', ...patterns];
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function detectMissingExport(stderr) {
  // Node ESM error message for missing named export
  // e.g., "The requested module '.../summary.mjs' does not provide an export named 'summaryOf'"
  const m = stderr.match(/does not provide an export named '([^']+)'/i);
  return m ? m[1] : null;
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
  // If already exported, do nothing
  if (new RegExp(`export\\s*\\{\\s*${symbol}\\s*\\}`).test(src)) return false;
  const out = src.replace(/\s*$/, '') + `\nexport { ${symbol} };\n`;
  await fs.writeFile(filePath, out, 'utf8');
  return true;
}

export async function selfReview({ projectRoot, changedFiles = [], profile = process.env.PROFILE || 'longrun' } = {}) {
  const cwd = projectRoot || process.cwd();
  const patterns = changedFilesToTestPatterns(changedFiles);

  // First run
  const first = await runNodeTests({ cwd, patterns });
  if (first.code === 0) {
    return { ok: true, retried: false, testsRun: patterns, summary: 'green' };
  }

  // Try trivial auto-fix: missing export
  const missing = detectMissingExport(first.stderr || '');
  if (missing) {
    const target = await findDefiningFile(cwd, missing, changedFiles);
    if (target) {
      const changed = await appendNamedExport(target, missing);
      if (changed) {
        const second = await runNodeTests({ cwd, patterns });
        if (second.code === 0) {
          return {
            ok: true,
            retried: true,
            fix: { kind: 'missing-export', file: path.relative(cwd, target), symbol: missing },
            testsRun: patterns,
            summary: 'fixed missing export'
          };
        }
      }
    }
  }

  // Non-trivial failure
  const summary = (first.stderr || first.stdout || '').slice(0, 2000);
  return { ok: false, code: 'CHECKS_FAILED', retried: false, testsRun: patterns, summary };
}
