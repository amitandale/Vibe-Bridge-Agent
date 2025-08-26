
import { promises as fs } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { runNodeTestPattern } from '../tools/broker.mjs';

/** Build a small set of test patterns for a list of changed files.
 *  Heuristic: for lib/foo/bar.mjs -> tests/**/*bar*test.mjs and tests/**/*foo*test.mjs
 */
export function changedFilesToTestPatterns(changedFiles = []) {
  const pats = new Set();
  for (const f of changedFiles) {
    const base = basename(String(f)).replace(/\.(mjs|js|ts)$/, '');
    if (base) pats.add(`tests/**/*${base}*test.mjs`);
    const dir = basename(dirname(String(f)));
    if (dir && dir !== base) pats.add(`tests/**/*${dir}*test.mjs`);
  }
  // Always include a broad fallback when heuristics miss
  pats.add('tests/**/*.test.mjs');
  return Array.from(pats);
}

async function readFileSafe(p) {
  try { return await fs.readFile(p, 'utf8'); } catch { return ''; }
}

async function tryFixMissingExport(projectRoot, changedFiles) {
  // For each changed file, look for "function name(" with no "export" before it.
  for (const file of changedFiles) {
    const full = join(projectRoot, file);
    const src = await readFileSafe(full);
    if (!src) continue;

    // Find top-level function declarations
    const m = src.match(/^\s*function\s+([A-Za-z0-9_]+)\s*\(/m);
    if (m) {
      const fn = m[1];
      const hasNamedExport = new RegExp(`export\\s+function\\s+${fn}\\b`).test(src);
      const hasExportList = new RegExp(`export\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}`).test(src);
      if (!hasNamedExport && !hasExportList) {
        // Naively prefix with export
        const fixed = src.replace(m[0], m[0].replace('function', 'export function'));
        await fs.mkdir(join(full, '..'), { recursive: true }).catch(()=>{});
        await fs.writeFile(full, fixed, 'utf8');
        return { applied: true, kind: 'missing-export', file, symbol: fn };
      }
    }
  }
  return { applied: false };
}

export async function selfReview({ projectRoot = process.cwd(), changedFiles = [], profile = process.env.PROFILE || 'longrun', timeoutMs = 60000 } = {}) {
  if (profile !== 'longrun') {
    return { skipped: true, reason: 'serverless', ok: true };
  }

  const patterns = changedFilesToTestPatterns(changedFiles);
  const runOne = async (p) => runNodeTestPattern({ projectRoot, pattern: p, timeoutMs });

  // First run
  let anyFail = false;
  const collected = [];
  for (const p of patterns) {
    const r = await runOne(p);
    collected.push({ pattern: p, code: r.code, stdout: r.stdout, stderr: r.stderr });
    if (r.code !== 0) anyFail = true;
  }
  if (!anyFail) return { ok: true, retried: false, testsRun: patterns };

  // Attempt trivial auto-fix (missing export)
  const fix = await tryFixMissingExport(projectRoot, changedFiles);
  if (fix.applied) {
    const rerun = [];
    let stillFail = false;
    for (const p of patterns) {
      const r = await runOne(p);
      rerun.push({ pattern: p, code: r.code, stdout: r.stdout, stderr: r.stderr });
      if (r.code !== 0) stillFail = true;
    }
    if (!stillFail) return { ok: true, retried: true, fix, testsRun: patterns };
    const failText = rerun.map(x => x.stderr || x.stdout).join('\n').slice(0, 2000);
    return { ok: false, code: 'CHECKS_FAILED', retried: true, fix, testsRun: patterns, summary: failText };
  }

  const failText = collected.map(x => x.stderr || x.stdout).join('\n').slice(0, 2000);
  return { ok: false, code: 'CHECKS_FAILED', retried: false, testsRun: patterns, summary: failText };
}
