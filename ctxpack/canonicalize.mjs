// Deterministic canonical JSON and path normalization
import { ALLOWED_SECTIONS } from "./schema.mjs";

function isPlainObject(x) {
  return Object.prototype.toString.call(x) === "[object Object]";
}

export function normalizePath(p) {
  if (typeof p !== "string") return p;
  // normalize slashes
  let s = p.replace(/\\/g, "/");
  // remove leading ./
  s = s.replace(/^\.\/+/, "");
  // collapse // to /
  s = s.replace(/\/+/g, "/");
  // remove trailing /
  if (s.length > 1) s = s.replace(/\/+$/,"");
  // prevent path traversal
  if (s.includes("..")) {
    throw new Error(`invalid path contains '..': ${p}`);
  }
  return s;
}

// Recursively sort object keys and drop undefined
export function canonicalizeObject(x) {
  if (Array.isArray(x)) {
    return x.map(canonicalizeObject);
  }
  if (isPlainObject(x)) {
    const out = {};
    Object.keys(x).sort().forEach(k => {
      const v = x[k];
      if (v === undefined) return;
      out[k] = canonicalizeObject(v);
    });
    return out;
  }
  return x;
}

export function canonicalJSONStringify(obj) {
  return JSON.stringify(canonicalizeObject(obj), null, 2) + "\n";
}

// Normalize pack specific fields
export function normalizePackPaths(pack) {
  const fixItem = (it) => {
    if (it && it.loc && it.loc.path) {
      it.loc.path = normalizePath(it.loc.path);
    }
    return it;
  };
  for (const key of ["must_include","nice_to_have"]) {
    if (Array.isArray(pack[key])) {
      pack[key] = pack[key].map(fixItem);
    }
  }
  // order: filter to allowed, keep given order but dedupe
  if (Array.isArray(pack.order)) {
    const seen = new Set();
    pack.order = pack.order.filter((sec) => {
      if (!ALLOWED_SECTIONS.includes(sec)) return false;
      if (seen.has(sec)) return false;
      seen.add(sec);
      return true;
    });
  }
  return pack;
}

export function canonicalizePack(pack) {
  // Normalize paths before canonicalization
  const copy = JSON.parse(JSON.stringify(pack));
  normalizePackPaths(copy);
  return canonicalJSONStringify(copy);
}
