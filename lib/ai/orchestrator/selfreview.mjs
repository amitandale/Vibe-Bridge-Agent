import { promises as fs } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { runNodeTestPattern } from '../tools/broker.mjs';

async function fileExists(p){ try { await fs.access(p); return true; } catch { return false; } }

export function changedFilesToTestPatterns(changedFiles = []) {
  const names = new Set();
  for (const f of changedFiles) {
    const b = basename(f).replace(/\.[^.]+$/, '');
    if (b) names.add(b);
    const parent = basename(join(f, '..'));
    if (parent) names.add(parent);
  }
  const out = [];
  for (const n of names) {
    out.push(`tests/**/*${n}*.mjs`);
  }
  // Always add a safety net so we don't miss anything
  out.push('tests/**/*.mjs');
  return out;
}

function classifyFailure(stderrOrStdout) {
  const s = String(stderrOrStdout || '');
  // Node ESM classic: "The requested module '../lib/foo.mjs' does not provide an export named 'bar'"
  let m = s.match(/module ['"](.+?\.mjs)['"] does not provide an export named ['"](.+?)['"]/);
  if (m) return { kind: 'import-not-found', from: m[1], want: m[2] };
  // Alternative wording: "Named export 'bar' not found ... The requested module '.../foo.mjs' ..."
  m = s.match(/Named export ['"](.+?)['"] not found[\s\S]*?module ['"](.+?\.mjs)['"]/);
  if (m) return { kind: 'import-not-found', from: m[2], want: m[1] };
  return { kind: 'other' };
}


async function applyTrivialFix({ projectRoot, classified }) {
  if (classified.kind !== 'import-not-found') return null;
  let from = classified.from;
  // Normalize file:// URLs and resolve to absolute path
  if (from.startsWith('file://')) {
    try { from = new URL(from).pathname; } catch {}
  }
  const full = from.startsWith('/') ? from : resolve(projectRoot, from);
  if (!(await fileExists(full))) return null;
  const want = classified.want;
  let txt = await fs.readFile(full, 'utf8');
  const hasDecl = new RegExp(`\\b(function|class|const|let|var)\\s+${want}\\b`).test(txt);
  const alreadyExported = new RegExp(`export\\s+(?:default\\s+)?(?:function|class|const|let|var)\\s+${want}\\b`).test(txt)
    || new RegExp(`export\\s*{[^}]*\\b${want}\\b[^}]*}`).test(txt);
  if (hasDecl && !alreadyExported) {
    if (!/\\n$/.test(txt)) txt += '\n';
    txt += `export { ${want} };\n`;
    await fs.writeFile(full, txt, 'utf8');
    return { kind: 'missing-export', file: full, symbol: want };
  }
  return null;
}

export async function selfReview({ projectRoot, changedFiles = [], profile = 'quick' } = {}) {
  const patterns = changedFilesToTestPatterns(changedFiles);
  const collected = [];
  async function runOne(pat) {
    const res = await runNodeTestPattern({ projectRoot, pattern: pat, timeoutMs: profile === 'longrun' ? 120000 : 60000 });
    collected.push({ pattern: pat, ...res });
    return res;
  }
  // First pass
  let anyFail = false;
  for (const p of patterns) {
    const r = await runOne(p);
    if (r.code !== 0) anyFail = true;
  }
  if (!anyFail) return { ok: true, retried: false, testsRun: patterns };

  // Try the trivial auto-fix path
  const joined = collected.map(x => x.stderr || x.stdout).join('\\n').slice(0, 4000);
  const classified = classifyFailure(joined);
  const fix = await applyTrivialFix({ projectRoot, classified });
  if (fix) {
    // Re-run
    const rerun = [];
    let stillFail = false;
    for (const p of patterns) {
      const r = await runOne(p);
      rerun.push({ pattern: p, code: r.code });
      if (r.code !== 0) stillFail = true;
    }
    if (!stillFail) return { ok: true, retried: true, fix, testsRun: patterns };
    return { ok: false, code: 'CHECKS_FAILED', retried: true, fix, testsRun: patterns, summary: joined };
  }

  return { ok: false, code: 'CHECKS_FAILED', retried: false, testsRun: patterns, summary: joined };
}
