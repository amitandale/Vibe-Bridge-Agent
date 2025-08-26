import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { runNodeTestPattern } from '../tools/broker.mjs';

/**
 * Build simple test-glob patterns from changed files.
 * e.g., 'lib/events/summary.mjs' -> 'tests/**/*summary*.mjs'
 */
export function changedFilesToTestPatterns(changed = []) {
  const seen = new Set();
  const out = [];
  for (const rel of changed) {
    const base = basename(String(rel)).replace(/\.(mjs|js|cjs)$/i, '');
    if (base && !seen.has(base)) { seen.add(base); out.push(`tests/**/*${base}*.mjs`); }
  }
  return out.length ? out : ['tests/**/*.mjs'];
}

function extractMissingExportSymbol(text) {
  if (!text) return null;
  let m = text.match(/does not provide an export named '([^']+)'/i);
  if (m) return m[1];
  m = text.match(/Named export '([^']+)' not found/i);
  if (m) return m[1];
  return null;
}

async function findDefiningFile(projectRoot, symbol, changedFiles = []) {
  // Prefer changed files that define the symbol
  for (const rel of changedFiles) {
    if (!/\.mjs$/i.test(rel)) continue;
    const full = join(projectRoot, rel);
    try {
      const src = await fs.readFile(full, 'utf8');
      if (new RegExp(`\\b(function|const|let|var)\\s+${symbol}\\b`).test(src)) return full;
    } catch {}
  }
  // Fallback: scan lib/** for a definition
  const start = join(projectRoot, 'lib');
  const queue = [start];
  while (queue.length) {
    const dir = queue.shift();
    let ents = [];
    try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const full = join(dir, e.name);
      if (e.isDirectory()) queue.push(full);
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

async function appendNamedExport(absFile, symbol) {
  const src = await fs.readFile(absFile, 'utf8').catch(() => '');
  if (!src) return false;
  // If it's already exported, do nothing
  if (new RegExp(`export\\s*\\{\\s*${symbol}\\s*\\}`).test(src)) return false;
  const out = src.replace(/\s*$/, '') + `\nexport { ${symbol} };\n`;
  await fs.writeFile(absFile, out, 'utf8');
  return true;
}

export async function selfReview({ projectRoot, changedFiles = [], profile = process.env.PROFILE || 'longrun' } = {}) {
  const root = projectRoot;
  const patterns = changedFilesToTestPatterns(changedFiles);

  // First pass: run each pattern and collect results
  const results = [];
  let anyFail = false;
  for (const pattern of patterns) {
    const r = await runNodeTestPattern({ projectRoot: root, pattern });
    results.push({ pattern, ...r });
    if (r.code !== 0) anyFail = true;
  }
  if (!anyFail) return { ok: true, retried: false, testsRun: patterns, summary: 'green' };

  // Detect trivial "missing export" error across failures
  const combined = results.map(r => (r.stderr || r.stdout || '')).join('\n');
  const missing = extractMissingExportSymbol(combined);
  if (missing) {
    const target = await findDefiningFile(root, missing, changedFiles);
    if (target) {
      const changed = await appendNamedExport(target, missing);
      if (changed) {
        // Re-run
        const rerun = [];
        let stillFail = false;
        for (const pattern of patterns) {
          const r = await runNodeTestPattern({ projectRoot: root, pattern });
          rerun.push({ pattern, ...r });
          if (r.code !== 0) stillFail = true;
        }
        if (!stillFail) {
          return {
            ok: true,
            retried: true,
            fix: { kind: 'missing-export', file: target.startsWith(root) ? target.slice(root.length+1) : target, symbol: missing },
            testsRun: patterns,
            summary: 'fixed missing export'
          };
        }
        // If it still fails after the edit, treat as non-trivial
        const failText = rerun.map(r => r.stderr || r.stdout).join('\n').slice(0, 2000);
        return { ok:false, code:'CHECKS_FAILED', retried:true, testsRun: patterns, summary: failText };
      }
    }
  }

  // Non-trivial failure
  const failText = results.map(r => r.stderr || r.stdout).join('\n').slice(0, 2000);
  return { ok:false, code:'CHECKS_FAILED', retried:false, testsRun: patterns, summary: failText };
}
