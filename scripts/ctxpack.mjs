#!/usr/bin/env node
// Usage: node scripts/ctxpack.mjs <validate|hash|print|assemble> <file|--in draft.json> [...flags]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateFile } from '../lib/ctxpack/validate.mjs';
import { sha256Canonical } from '../lib/ctxpack/hash.mjs';
import { assemble } from '../lib/ctxpack/assemble.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function showUsage() {
  console.error(`Usage:
  node scripts/ctxpack.mjs validate <file.json>
  node scripts/ctxpack.mjs hash <file.json>
  node scripts/ctxpack.mjs print <file.json>
  node scripts/ctxpack.mjs assemble --model <id> --in <draft.json> [--out <pack.json>] [--dry-run] [--report <report.json>]
    [--budget.max_tokens <int>] [--budget.max_files <int>] [--budget.max_per_file_tokens <int>]
    [--section.cap <section>=<tokens>,<files>]  # may repeat
    [--merge.max_tokens <int>]
    [--fail-on-warn]`);
}

function parseArgs(argv) {
  const out = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, vMaybe] = a.split('=', 2);
      let v = vMaybe;
      if (v === undefined) {
        // if next exists and not another flag, take as value
        const next = argv[i+1];
        if (next && !String(next).startsWith('--')) { v = next; i++; }
        else v = true;
      }
      out[k.slice(2)] = v;
    } else {
      out._.push(a);
    }
    i++;
  }
  return out;
}

function toInt(x, def=null) {
  if (x === undefined || x === null || x === true || x === false) return def;
  const n = Number.parseInt(String(x), 10);
  return Number.isFinite(n) ? n : def;
}

async function cmdValidate(file) {
  await validateFile(file);
  console.log('OK');
}

async function cmdHash(file) {
  const raw = await fs.readFile(file, 'utf8');
  const obj = JSON.parse(raw);
  const h = sha256Canonical(obj);
  console.log(h);
}

async function cmdPrint(file) {
  const raw = await fs.readFile(file, 'utf8');
  const obj = JSON.parse(raw);
  console.log(JSON.stringify(obj, null, 2));
}

function parseSectionCaps(values) {
  // values may be string or array of strings: "<section>=<tokens>,<files>"
  if (!values) return {};
  const arr = Array.isArray(values) ? values : [values];
  const caps = {};
  for (const s of arr) {
    const eq = String(s).indexOf('=');
    if (eq === -1) continue;
    const section = s.slice(0, eq);
    const rest = s.slice(eq+1);
    const [tokStr, fileStr] = rest.split(',', 2);
    const tokens = toInt(tokStr, null);
    const files = toInt(fileStr, null);
    caps[section] = { ...(tokens!=null?{max_tokens:tokens}:{}) , ...(files!=null?{max_files:files}:{}) };
  }
  return caps;
}

function humanSummary(manifest) {
  // legacy human-readable output

  const m = manifest?.metrics || {};
  const ev = manifest?.evictions || [];
  const ptr = manifest?.pointers || [];
  const sec = m.per_section || {};
  let lines = [];
  lines.push(`tokens_total=${m.tokens_total ?? 0} files_total=${m.files_total ?? 0}`);
  lines.push(`evictions=${ev.length} pointers=${ptr.length} deduped=${m.deduped ?? 0} merged_spans=${m.merged_spans ?? 0}`);
  const keys = Object.keys(sec).sort();
  for (const k of keys) {
    const s = sec[k] || {};
    lines.push(`section:${k} tokens=${s.tokens ?? 0} files=${s.files ?? 0}`);
  }
  return lines.join('\n');
}
function jsonSummary(manifest) {
  const m = manifest?.metrics || {};
  const ev = Array.isArray(manifest?.evictions) ? manifest.evictions : [];
  const ptr = Array.isArray(manifest?.pointers) ? manifest.pointers : [];
  const sec = m.per_section || {};
  const totals = {
    tokens_total: m.tokens_total ?? 0,
    files_total: m.files_total ?? 0,
    evictions: ev.length,
    pointers: ptr.length,
    deduped: m.deduped ?? 0,
    merged_spans: m.merged_spans ?? 0,
  };
  const perSection = {};
  for (const k of Object.keys(sec).sort()) {
    const s = sec[k] || {};
    perSection[k] = { tokens: s.tokens ?? 0, files: s.files ?? 0 };
  }
  return { totals, perSection };
}


async function cmdAssemble(flags) {
  const infile = flags.in || flags._[0]; // backward compat with old usage: assemble <file>
  if (!infile) {
    showUsage();
    process.exit(2);
  }
  const model = flags.model || 'default';
  const outPath = flags.out || null;
  const dryRun = Boolean(flags['dry-run']);
  const reportPath = flags.report || null;

  // budget overrides
  const budget = {};
  const caps = {};
  const sectionCaps = parseSectionCaps(flags['section.cap']);
  if (sectionCaps && Object.keys(sectionCaps).length) budget.section_caps = sectionCaps;
  const t = toInt(flags['budget.max_tokens'], null);
  if (t != null) budget.max_tokens = t;
  const mf = toInt(flags['budget.max_files'], null);
  if (mf != null) budget.max_files = mf;
  const mpf = toInt(flags['budget.max_per_file_tokens'], null);
  if (mpf != null) budget.max_per_file_tokens = mpf;

  const mergeMax = toInt(flags['merge.max_tokens'], null);
  const failOnWarn = Boolean(flags['fail-on-warn']);

  // Load draft
  const raw = await fs.readFile(infile, 'utf8');
  const draft = JSON.parse(raw);

  // Apply overrides non-destructively
  const draftWith = { ...draft };
  if (Object.keys(budget).length) {
    draftWith.budgets = { ...(draft.budgets || {}), ...budget };
  }

  // Assemble once
  let manifest;
  try {
    manifest = await assemble(draftWith, { model, merge_max_tokens: mergeMax ?? undefined });
  } catch (e) {
    const code = e?.code || 'ASSEMBLY_ERROR';
    const msg = e?.message || String(e);
    console.error(`${code}:${msg}`);
    // Map exit codes
    if (code === 'SCHEMA_ERROR' || code === 'SCHEMA_INVALID' || code === 'MISSING_REQUIRED') process.exit(2);
    if (code === 'BUDGET_ERROR') process.exit(3);
    process.exit(1);
  }

  // Determinism check in dev (or when explicitly requested via env)
  if (process.env.NODE_ENV === 'development' || process.env.CTX_DETERMINISM_CHECK === '1') {
    const again = await assemble(draftWith, { model, merge_max_tokens: mergeMax ?? undefined });
    const a = (manifest && manifest.hash) || sha256Canonical(manifest);
    const b = (again && again.hash) || sha256Canonical(again);
    if (a !== b) {
      console.error('DETERMINISM_ERROR: hash mismatch across two runs');
      process.exit(4);
    }
  }

  // Output selection
  if (dryRun) {
    const j = jsonSummary(manifest);
    console.log(JSON.stringify(j));
  } else if (outPath) {
    console.log(outPath);
  } else {
    const summary = humanSummary(manifest);
    console.log(summary);
  }

  // JSON report
  if (reportPath) {
    const report = {
      model,
      infile: path.resolve(infile),
      outPath: outPath ? path.resolve(outPath) : null,
      metrics: manifest?.metrics || null,
      evictions: manifest?.evictions || [],
      pointers: manifest?.pointers || [],
      hash: manifest?.hash || sha256Canonical(manifest),
      now_utc: new Date().toISOString(),
      ok: true,
      warnings: [],
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true }).catch(()=>{});
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  }

  // Fail on warn gate: if there are evictions and user asked to fail on warn, exit non-zero
  if (failOnWarn && (manifest?.evictions?.length || 0) > 0) {
    console.error('WARN_TO_FAIL: evictions present and --fail-on-warn requested');
    process.exit(1);
  }

  // Persist manifest if requested and not a dry-run
  if (outPath && !dryRun) {
    await fs.mkdir(path.dirname(outPath), { recursive: true }).catch(()=>{});
    const toWrite = Array.isArray(manifest?.sections) ? manifest : { ...manifest, sections: [] };
    await fs.writeFile(outPath, JSON.stringify(toWrite, null, 2), 'utf8');
}

  process.exit(0);
}

async function main() {
  const [,, cmd, maybeFileOrFlag, ...rest] = process.argv;
  if (!cmd || !['validate','hash','print','assemble'].includes(cmd)) {
    showUsage();
    process.exit(2);
  }
  if (cmd === 'validate') {
    if (!maybeFileOrFlag || maybeFileOrFlag.startsWith('--')) { showUsage(); process.exit(2); }
    await cmdValidate(maybeFileOrFlag);
    return;
  }
  if (cmd === 'hash') {
    if (!maybeFileOrFlag || maybeFileOrFlag.startsWith('--')) { showUsage(); process.exit(2); }
    await cmdHash(maybeFileOrFlag);
    return;
  }
  if (cmd === 'print') {
    if (!maybeFileOrFlag || maybeFileOrFlag.startsWith('--')) { showUsage(); process.exit(2); }
    await cmdPrint(maybeFileOrFlag);
    return;
  }
  if (cmd === 'assemble') {
    const flags = parseArgs([maybeFileOrFlag, ...rest].filter(Boolean));
    await cmdAssemble(flags);
    return;
  }
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
