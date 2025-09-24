// Lightweight structural validator and budget/invariant checks
import { CTX_PACK_SCHEMA_VERSION, ALLOWED_SECTIONS, ALLOWED_SOURCES } from "./schema.mjs";
import { canonicalizePack } from "./canonicalize.mjs";
import { computePackHash } from "./hash.mjs";

function isObject(x) { return x && typeof x === "object" && !Array.isArray(x); }
const HEX64 = /^[0-9a-f]{64}$/;

const TOP_KEYS = new Set(["version","project","pr","mode","order","budgets","must_include","nice_to_have","never_include","provenance","hash"]);

function unknownKeys(obj, allowedSet) {
  return Object.keys(obj).filter(k => !allowedSet.has(k));
}

function ensure(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

function positiveInt(n) { return Number.isInteger(n) && n > 0; }
function nonnegInt(n) { return Number.isInteger(n) && n >= 0; }

function matchGlob(path, pattern) {
  // Convert simple glob to safe regex.
  // Rules: "**" -> ".*" (across dirs), "*" -> "[^/]*" (single segment), "?" -> "[^/]"
  // Escape regex specials first, but keep * and ? for conversion.
  const esc = (s) => s.replace(/([.+^${}()|[\]\])/g, "\$1");
  let s = esc(String(pattern));
  s = s.replace(/\*\*/g, "__DOUBLE_STAR__");
  s = s.replace(/\*/g, "[^/]*");
  s = s.replace(/__DOUBLE_STAR__/g, ".*");
  s = s.replace(/\?/g, "[^/]");
  const rx = "^" + s + "$";
  try { return new RegExp(rx).test(String(path)); } catch { return false; }
}()|[\]\\]/g, "\\$&");
  const rx = "^" + esc(pattern).replace(/\\\*/g, ".*").replace(/\\\?/g, ".") + "$";
  return new RegExp(rx).test(path);
}

export function validatePack(pack, { allowMinor = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!isObject(pack)) return { ok: false, errors: ["pack must be an object"], warnings };

  // unknown top-level keys
  const topUnknown = unknownKeys(pack, TOP_KEYS);
  ensure(topUnknown.length === 0, "unknown top-level keys: " + topUnknown.join(","), errors);

  // version
  if (typeof pack.version !== "string") {
    errors.push("version must be a string");
  } else {
    if (pack.version !== CTX_PACK_SCHEMA_VERSION) {
      if (allowMinor && /^1\.\d+\.\d+$/.test(pack.version)) {
        warnings.push(`accepting minor version ${pack.version}`);
      } else {
        errors.push(`unsupported version: ${pack.version}`);
      }
    }
  }

  // project
  ensure(isObject(pack.project), "project must be object", errors);
  if (isObject(pack.project)) {
    const u = unknownKeys(pack.project, new Set(["id"]));
    ensure(u.length === 0, "project has unknown keys: " + u.join(","), errors);
    ensure(typeof pack.project.id === "string" && pack.project.id.length > 0, "project.id required", errors);
  }

  // pr
  ensure(isObject(pack.pr), "pr must be object", errors);
  if (isObject(pack.pr)) {
    const u = unknownKeys(pack.pr, new Set(["id","branch","commit_sha"]));
    ensure(u.length === 0, "pr has unknown keys: " + u.join(","), errors);
    ensure(typeof pack.pr.id === "string" && pack.pr.id.length > 0, "pr.id required", errors);
    ensure(typeof pack.pr.branch === "string" && pack.pr.branch.length > 0, "pr.branch required", errors);
    ensure(typeof pack.pr.commit_sha === "string" && /^[0-9a-f]{7,40}$/.test(pack.pr.commit_sha), "pr.commit_sha invalid", errors);
  }

  // mode
  ensure(["MVP","PR","FIX"].includes(pack.mode), "mode must be MVP|PR|FIX", errors);

  // order
  ensure(Array.isArray(pack.order) && pack.order.length > 0, "order array required", errors);
  if (Array.isArray(pack.order)) {
    const seen = new Set();
    for (const s of pack.order) {
      ensure(ALLOWED_SECTIONS.includes(s), `order contains invalid section: ${s}`, errors);
      ensure(!seen.has(s), `order contains duplicate section: ${s}`, errors);
      seen.add(s);
    }
  }

  // budgets
  ensure(isObject(pack.budgets), "budgets must be object", errors);
  if (isObject(pack.budgets)) {
    const u = unknownKeys(pack.budgets, new Set(["max_tokens","max_files","max_per_file_tokens","section_caps"]));
    ensure(u.length === 0, "budgets has unknown keys: " + u.join(","), errors);
    ensure(typeof pack.budgets.max_tokens === "number" && pack.budgets.max_tokens > 0, "max_tokens > 0", errors);
    ensure(typeof pack.budgets.max_files === "number" && pack.budgets.max_files >= 0, "max_files >= 0", errors);
    ensure(typeof pack.budgets.max_per_file_tokens === "number" && pack.budgets.max_per_file_tokens > 0, "max_per_file_tokens > 0", errors);
    ensure(isObject(pack.budgets.section_caps), "section_caps must be object", errors);
    if (isObject(pack.budgets.section_caps)) {
      for (const [k,v] of Object.entries(pack.budgets.section_caps)) {
        ensure(ALLOWED_SECTIONS.includes(k), `section_caps has invalid section: ${k}`, errors);
        ensure(typeof v === "number" && v >= 0, `section_caps[${k}] must be >=0`, errors);
      }
    }
  }

  // items
  const validateItem = (it, key, idx) => {
    const allowed = new Set(["kind","section","loc","symbol","sha256","source","reason"]);
    const u = unknownKeys(it, allowed);
    ensure(u.length === 0, `${key}[${idx}] has unknown keys: ` + u.join(","), errors);
    ensure(typeof it.kind === "string" && it.kind.length > 0, `${key}[${idx}].kind required`, errors);
    ensure(ALLOWED_SECTIONS.includes(it.section), `${key}[${idx}].section invalid`, errors);
    ensure(isObject(it.loc), `${key}[${idx}].loc required`, errors);
    if (isObject(it.loc)) {
      const ul = unknownKeys(it.loc, new Set(["path","start_line","end_line"]));
      ensure(ul.length === 0, `${key}[${idx}].loc has unknown keys: ` + ul.join(","), errors);
      ensure(typeof it.loc.path === "string" && it.loc.path.length > 0, `${key}[${idx}].loc.path required`, errors);
      ensure(positiveInt(it.loc.start_line), `${key}[${idx}].loc.start_line positive int`, errors);
      if (it.loc.end_line !== undefined) {
        ensure(positiveInt(it.loc.end_line), `${key}[${idx}].loc.end_line positive int`, errors);
        if (positiveInt(it.loc.end_line) && positiveInt(it.loc.start_line)) {
          ensure(it.loc.end_line >= it.loc.start_line, `${key}[${idx}].loc.end_line >= start_line`, errors);
        }
      }
    }
    ensure(HEX64.test(it.sha256), `${key}[${idx}].sha256 must be 64 hex`, errors);
    ensure(ALLOWED_SOURCES.includes(it.source), `${key}[${idx}].source invalid`, errors);
  };

  for (const key of ["must_include","nice_to_have"]) {
    ensure(Array.isArray(pack[key]), `${key} must be array`, errors);
    if (Array.isArray(pack[key])) {
      pack[key].forEach((it, i) => {
        if (!isObject(it)) { errors.push(`${key}[${i}] must be object`); return; }
        validateItem(it, key, i);
      });
    }
  }

  // never_include
  ensure(Array.isArray(pack.never_include), "never_include must be array", errors);

  // provenance
  ensure(Array.isArray(pack.provenance), "provenance must be array", errors);
  if (Array.isArray(pack.provenance)) {
    pack.provenance.forEach((p, i) => {
      const allowed = new Set(["source","generator","projectId","commit_sha","created_at"]);
      const u = unknownKeys(p, allowed);
      ensure(u.length === 0, `provenance[${i}] has unknown keys: ` + u.join(","), errors);
      ensure(ALLOWED_SOURCES.includes(p.source), `provenance[${i}].source invalid`, errors);
      ensure(typeof p.generator === "string" && p.generator.length > 0, `provenance[${i}].generator required`, errors);
      ensure(typeof p.created_at === "string" && !isNaN(Date.parse(p.created_at)), `provenance[${i}].created_at invalid`, errors);
    });
  }

  // canonical hash
  if (typeof pack.hash !== "string" || !HEX64.test(pack.hash)) {
    errors.push("hash must be 64 hex");
  } else {
    const expected = computePackHash(pack);
    if (pack.hash !== expected) {
      errors.push(`hash mismatch: expected ${expected} got ${pack.hash}`);
    }
  }

  // budget + invariants
  if (isObject(pack.budgets)) {
    const must = Array.isArray(pack.must_include) ? pack.must_include : [];
    const nice = Array.isArray(pack.nice_to_have) ? pack.nice_to_have : [];
    if (typeof pack.budgets.max_files === "number") {
      if (must.length > pack.budgets.max_files) {
        errors.push(`must_include length ${must.length} exceeds max_files ${pack.budgets.max_files}`);
      }
    }
    if (isObject(pack.budgets.section_caps)) {
      const bySection = {};
      for (const it of must) {
        bySection[it.section] = (bySection[it.section] || 0) + 1;
      }
      for (const [sec, cap] of Object.entries(pack.budgets.section_caps)) {
        if (bySection[sec] && bySection[sec] > cap) {
          errors.push(`section ${sec} must_include ${bySection[sec]} exceeds cap ${cap}`);
        }
      }
    }
    // never_include wins
    const patterns = Array.isArray(pack.never_include) ? pack.never_include : [];
    for (const it of [...must, ...nice]) {
      const path = it?.loc?.path || "";
      for (const pat of patterns) {
        if (matchGlob(path, pat)) {
          errors.push(`path ${path} is blocked by never_include pattern ${pat}`);
          break;
        }
      }
    }
  }

  const canonical = canonicalizePack(pack);
  return { ok: errors.length === 0, errors, warnings, canonicalHash: computePackHash(pack), canonicalJSON: canonical };
}
