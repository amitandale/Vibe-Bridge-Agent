import { CtxpackError, ERR } from './errors.mjs';
import fs from 'node:fs/promises';

const ORDER = ['templates','spec_canvas','diff_slices','linked_tests','contracts','extras'];
const SOURCES = ['planner','mcp','fs','git','openapi','sql','llamaindex'];

function assert(cond, code, msg) {
  if (!cond) throw new CtxpackError(code, msg);
}

function isPlainObject(x){ return x && typeof x === 'object' && !Array.isArray(x); }

export function validateObject(pack, {strictOrder=true, allowMinor=process.env.CTXPACK_ALLOW_MINOR==='1'} = {}) {
  assert(isPlainObject(pack), ERR.SCHEMA_INVALID, 'pack must be object');
  const v = pack.version;
  assert(typeof v === 'string', ERR.SCHEMA_INVALID, 'version must be string');
  if (v !== '1.0.0') {
    const minorOk = allowMinor && /^1\.\d+\.\d+$/.test(v);
    assert(minorOk, ERR.SCHEMA_INVALID, `unsupported version ${v}`);
  }

  // Reject unknown top-level fields
  const allowedTop = new Set(['version','project','pr','mode','order','budgets','sections','must_include','nice_to_have','never_include','provenance','hash']);
  for (const k of Object.keys(pack)) assert(allowedTop.has(k), ERR.SCHEMA_INVALID, `unknown field ${k}`);

  // Basic requireds
  const project = pack.project;
  assert(isPlainObject(project) && typeof project.id==='string' && project.id, ERR.MISSING_REQUIRED, 'project.id required');

  const pr = pack.pr;
  assert(isPlainObject(pr) && typeof pr.id==='string' && pr.id, ERR.MISSING_REQUIRED, 'pr.id required');
  assert(typeof pr.branch==='string'&&pr.branch, ERR.MISSING_REQUIRED, 'pr.branch required');
  assert(typeof pr.commit_sha==='string'&&pr.commit_sha.length>=7, ERR.MISSING_REQUIRED, 'pr.commit_sha required');

  assert(['MVP','PR','FIX'].includes(pack.mode), ERR.SCHEMA_INVALID, 'mode invalid');

  // Order
  assert(Array.isArray(pack.order) && pack.order.every(s=>ORDER.includes(s)), ERR.SCHEMA_INVALID, 'order invalid');
  const ordIdx = pack.order.map(n => ORDER.indexOf(n));
  const isOrdered = ordIdx.every((v,i,a)=> i===0 || v>=a[i-1]);
  if (strictOrder) assert(isOrdered, ERR.INVALID_ORDER, 'sections order invalid');

  // Budgets
  const b = pack.budgets||{};
  assert(Number.isInteger(b.max_tokens) && b.max_tokens>=0, ERR.SCHEMA_INVALID, 'budgets.max_tokens invalid');
  assert(Number.isInteger(b.max_files) && b.max_files>=0, ERR.SCHEMA_INVALID, 'budgets.max_files invalid');
  assert(Number.isInteger(b.max_per_file_tokens) && b.max_per_file_tokens>=0, ERR.SCHEMA_INVALID, 'budgets.max_per_file_tokens invalid');
  const sc = b.section_caps||{};
  for (const sec of ORDER) assert(Number.isInteger(sc[sec] ?? 0) && (sc[sec] ?? 0)>=0, ERR.SCHEMA_INVALID, `section_caps.${sec} invalid`);

  // Sections
  assert(Array.isArray(pack.sections), ERR.SCHEMA_INVALID, 'sections must be array');
  const names = [];
  for (const s of pack.sections) {
    assert(isPlainObject(s), ERR.SCHEMA_INVALID, 'section must be object');
    assert(ORDER.includes(s.name), ERR.SCHEMA_INVALID, `unknown section ${s.name}`);
    names.push(s.name);
    assert(Array.isArray(s.items), ERR.SCHEMA_INVALID, 'section.items must be array');
    for (const it of s.items) {
      assert(isPlainObject(it) && typeof it.id==='string' && it.id, ERR.MISSING_REQUIRED, 'item.id required');
      if (it.sha256) assert(/^[a-f0-9]{64}$/.test(it.sha256), ERR.SCHEMA_INVALID, 'item.sha256 invalid');
    }
  }

  // Must/Nice/Never
  for (const key of ['must_include','nice_to_have']) {
    const arr = pack[key] || [];
    assert(Array.isArray(arr), ERR.SCHEMA_INVALID, `${key} must be array`);
    for (const it of arr) {
      assert(isPlainObject(it), ERR.SCHEMA_INVALID, `${key} item must be object`);
      assert(['file','symbol','span'].includes(it.kind), ERR.SCHEMA_INVALID, `${key}.kind invalid`);
      assert(ORDER.includes(it.section), ERR.SCHEMA_INVALID, `${key}.section invalid`);
      assert(isPlainObject(it.loc) && typeof it.loc.path==='string' && it.loc.path, ERR.MISSING_REQUIRED, `${key}.loc.path required`);
      assert(Number.isInteger(it.loc.start_line) && it.loc.start_line>=1, ERR.SCHEMA_INVALID, `${key}.loc.start_line invalid`);
      if (it.loc.end_line!==undefined) assert(Number.isInteger(it.loc.end_line) && it.loc.end_line>=it.loc.start_line, ERR.SCHEMA_INVALID, `${key}.loc.end_line invalid`);
      assert(typeof it.sha256==='string' && /^[a-f0-9]{64}$/.test(it.sha256), ERR.SCHEMA_INVALID, `${key}.sha256 invalid`);
      assert(SOURCES.includes(it.source), ERR.SCHEMA_INVALID, `${key}.source invalid`);
    }
  }
  assert(Array.isArray(pack.never_include||[]), ERR.SCHEMA_INVALID, 'never_include must be array');
  assert(Array.isArray(pack.provenance||[]), ERR.SCHEMA_INVALID, 'provenance must be array');
  for (const p of pack.provenance) {
    assert(isPlainObject(p), ERR.SCHEMA_INVALID, 'provenance item must be object');
    assert(SOURCES.includes(p.source), ERR.SCHEMA_INVALID, 'provenance.source invalid');
    assert(typeof p.generator==='string' && p.generator, ERR.MISSING_REQUIRED, 'provenance.generator required');
    assert(typeof p.created_at==='string' && p.created_at.length>0, ERR.MISSING_REQUIRED, 'provenance.created_at required');
  }

  // Hash format only; content verification in gate
  assert(typeof pack.hash==='string' && /^[a-f0-9]{64}$/.test(pack.hash), ERR.SCHEMA_INVALID, 'hash invalid');

  return { ok: true };
}

export async function validateFile(filepath, opts) {
  const raw = await fs.readFile(filepath, 'utf8');
  const pack = JSON.parse(raw);
  return validateObject(pack, opts);
}
