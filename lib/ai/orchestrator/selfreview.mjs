/** lib/ai/orchestrator/selfreview.mjs
 * Self-review orchestrator for quick local checks.
 * - changedFilesToTestPatterns: turns changed files into simple test patterns
 * - selfReview: runs Node tests; on trivial "missing export" error, auto-fixes and re-runs
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function changedFilesToTestPatterns(changed = []) {
  // naive heuristic: for "lib/foo/bar.mjs" -> match tests containing "bar"
  const pats = [];
  for (const f of changed) {
    const base = path.basename(String(f)).replace(/\.mjs$/i, '');
    if (base && !pats.includes(base)) pats.push(base);
  }
  // Always include a catch-all to run something if changed is empty
  return pats.length ? pats.map(p => `tests/**/*${p}*.mjs`) : [ 'tests/**/*.mjs' ];
}

function runNodeTests({ cwd, patterns = [] }) {
  return new Promise((resolve) => {
    const args = ['--test', ...patterns];
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('close', (code) => resolve({ code, stdout: out, stderr: err }));
  });
}

function detectMissingExport(stderr) {
  // Node's ESM error often includes: "does not provide an export named 'X'"
  const m = stderr.match(/does not provide an export named '([^']+)'/i);
  return m ? m[1] : null;
}

async function findDefiningFile(root, symbol, candidates = []) {
  // simple search through changed files first, then lib/**/*.mjs
  const inChanged = candidates.find(f => f.endsWith('.mjs'));
  if (inChanged) return path.join(root, inChanged);
  // fallback: look in lib/
  const lib = path.join(root, 'lib');
  try {
    const q = [lib];
    while (q.length) {
      const d = q.shift();
      const ents = await fs.readdir(d, { withFileTypes: true });
      for (const e of ents) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) q.push(full);
        else if (e.isFile() && e.name.endsWith('.mjs')) {
          const s = await fs.readFile(full, 'utf8');
          if (new RegExp(`\\bfunction\\s+${symbol}\\b`).test(s) || new RegExp(`\\bconst\\s+${symbol}\\b`).test(s)) {
            return full;
          }
        }
      }
    }
  } catch {}
  return null;
}

async function autoExportSymbol(filePath, symbol) {
  const src = await fs.readFile(filePath, 'utf8');
  if (new RegExp(`export\\s*\\{\\s*${symbol}\\s*\\}`).test(src)) return false;
  const appended = src.trimEnd() + `\nexport { ${symbol} };\n`;
  await fs.writeFile(filePath, appended, 'utf8');
  return true;
}

export async function selfReview({ projectRoot, changedFiles = [], profile = process.env.PROFILE || 'longrun', timeoutMs = 60_000 } = {}) {
  const cwd = projectRoot || process.cwd();
  const patterns = changedFilesToTestPatterns(changedFiles);
  const first = await runNodeTests({ cwd, patterns });

  if (first.code === 0) {
    return { ok: true, retried: false, testsRun: patterns, summary: 'green' };
  }

  // Try trivial auto-fix: missing export
  const missing = detectMissingExport(first.stderr || '');
  if (missing) {
    const target = await findDefiningFile(cwd, missing, changedFiles);
    if (target) {
      const changed = await autoExportSymbol(target, missing);
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
  return { ok: false, code: 'CHECKS_FAILED', retried: false, testsRun: patterns, summary: first.stderr || first.stdout };
}
