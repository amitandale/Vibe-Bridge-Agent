import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { runNodeTestPattern } from '../tools/broker.mjs';

async function listFilesRec(rootDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(rootDir);
  return out;
}

function fileExists(p) { return fs.access(p).then(() => true).catch(() => false); }

function stem(name) { return String(name).replace(/\.(mjs|cjs|js|ts|tsx|jsx)$/i, ''); }

export function changedFilesToTestPatterns(changedFiles = []) {
  const pats = new Set();
  for (const f of changedFiles) {
    const b = basename(f);
    const s = stem(b);
    if (!s) continue;
    pats.add(`tests/**/*${s}*.mjs`);
    pats.add(`tests/**/${s}.test.mjs`);
  }
  if (pats.size === 0) pats.add('tests/**/*.smoke.mjs');
  return Array.from(pats);
}

function parseTrivial(stderr='') {
  let m = stderr.match(/does not provide an export named ['"]([A-Za-z0-9_]+)['"]/);
  if (m) return { kind: 'missing-export', name: m[1] };
  m = stderr.match(/Named export ['"]([A-Za-z0-9_]+)['"] not found/);
  if (m) return { kind: 'missing-export', name: m[1] };
  m = stderr.match(/Cannot find module ['"](.+?)['"] imported from ['"](.+?)['"]/);
  if (m) return { kind: 'import-not-found', want: m[1], from: m[2] };
  m = stderr.match(/is expected to be of type '(.+?)' but was given '(.+?)'/);
  if (m) return { kind: 'module-type-mismatch' };
  return null;
}

async function findFileDefiningSymbol(projectRoot, symbol) {
  const files = await listFilesRec(projectRoot);
  for (const f of files) {
    if (!/\.(mjs|js|cjs|ts|tsx|jsx)$/i.test(f)) continue;
    if (f.includes('/tests/')) continue;
    const txt = await fs.readFile(f, 'utf8').catch(() => '');
    if (new RegExp(`\\b(function|const|let|var|class)\\s+${symbol}\\b`).test(txt)) {
      return f;
    }
  }
  return null;
}

async function tryAutoFix({ projectRoot, changedFiles, classified }) {
  if (!classified) return { applied:false };
  if (classified.kind === 'missing-export') {
    const name = classified.name;
    // 1) Try changedFiles first
    for (const rel of changedFiles) {
      const full = join(projectRoot, rel);
      if (!(await fileExists(full))) continue;
      let txt = await fs.readFile(full, 'utf8');
      const hasDef = new RegExp(`\\b(function|const|let|var|class)\\s+${name}\\b`).test(txt);
      const alreadyExported = new RegExp(`export\\s+\\{[^}]*\\b${name}\\b[^}]*\\}`).test(txt) ||
                              new RegExp(`export\\s+(?:default\\s+)?(?:function|class|const|let|var)\\s+${name}\\b`).test(txt);
      if (hasDef && !alreadyExported) {
        if (!/\n$/.test(txt)) txt += '\n';
        txt += `export { ${name} };\n`;
        await fs.writeFile(full, txt, 'utf8');
        return { applied:true, kind:'missing-export', file: rel, symbol:name };
      }
    }
    // 2) Fallback: search the repo for the defining file
    const def = await findFileDefiningSymbol(projectRoot, name);
    if (def) {
      let txt = await fs.readFile(def, 'utf8');
      const alreadyExported = new RegExp(`export\\s+\\{[^}]*\\b${name}\\b[^}]*\\}`).test(txt) ||
                              new RegExp(`export\\s+(?:default\\s+)?(?:function|class|const|let|var)\\s+${name}\\b`).test(txt);
      if (!alreadyExported) {
        if (!/\n$/.test(txt)) txt += '\n';
        txt += `export { ${name} };\n`;
        await fs.writeFile(def, txt, 'utf8');
        return { applied:true, kind:'missing-export', file: def.replace(projectRoot + '/', ''), symbol:name };
      }
    }
  }
  if (classified.kind === 'import-not-found') {
    const from = classified.from;
    const want = classified.want;
    const full = from.startsWith('/') ? from : join(projectRoot, from);
    if (await fileExists(full)) {
      let txt = await fs.readFile(full, 'utf8');
      const alts = [['.mjs','.js'],['.js','.mjs']];
      for (const [a, b] of alts) {
        if (want.endsWith(a)) {
          const fix = want.slice(0, -a.length) + b;
          if (txt.includes(want)) {
            txt = txt.replaceAll(want, fix);
            await fs.writeFile(full, txt, 'utf8');
            return { applied:true, kind:'import-not-found', file: from, from: want, to: fix };
          }
        }
      }
    }
  }
  return { applied:false };
}

export async function selfReview({ projectRoot = process.cwd(), changedFiles = [], prefer = 'node', profile = process.env.PROFILE || 'longrun', timeoutMs = 60000 }) {
  if (profile !== 'longrun') {
    return { skipped:true, reason:'serverless', ok:true };
  }
  const patterns = changedFilesToTestPatterns(changedFiles);
  const runOne = async (p) => runNodeTestPattern({ projectRoot, pattern: p, timeoutMs });

  let anyFail = false;
  const collected = [];
  for (const p of patterns) {
    const r = await runOne(p);
    collected.push({ pattern: p, code: r.code, stdout: r.stdout, stderr: r.stderr });
    if (r.code !== 0) anyFail = true;
  }
  if (!anyFail) return { ok:true, retried:false, testsRun: patterns };

  const stderr = collected.map(x => x.stderr).join('\n');
  const classified = parseTrivial(stderr);

  const fix = await tryAutoFix({ projectRoot, changedFiles, classified });
  if (fix.applied) {
    const rerun = [];
    let stillFail = false;
    for (const p of patterns) {
      const r = await runOne(p);
      rerun.push({ pattern: p, code: r.code, stdout: r.stdout, stderr: r.stderr });
      if (r.code !== 0) stillFail = true;
    }
    if (!stillFail) return { ok:true, retried:true, fix, testsRun: patterns };
    const failText = rerun.map(x => x.stderr || x.stdout).join('\n').slice(0, 2000);
    return { ok:false, code:'CHECKS_FAILED', retried:true, fix, testsRun: patterns, summary: failText };
  }

  const failText = collected.map(x => x.stderr || x.stdout).join('\n').slice(0, 2000);
  return { ok:false, code:'CHECKS_FAILED', retried:false, testsRun: patterns, summary: failText };
}
