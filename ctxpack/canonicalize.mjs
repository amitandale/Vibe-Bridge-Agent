// ctxpack/canonicalize.mjs
import crypto from "node:crypto";

/** Stable JSON stringify with sorted object keys and no undefined values. */
export function stableStringify(value) {
  const seen = new WeakSet();
  function _walk(v) {
    if (v === null) return "null";
    const t = typeof v;
    if (t === "string") return JSON.stringify(v);
    if (t === "number") {
      if (!Number.isFinite(v)) return JSON.stringify(null);
      return String(v);
    }
    if (t === "boolean") return v ? "true" : "false";
    if (t === "bigint") return JSON.stringify(v.toString());
    if (t === "object") {
      if (seen.has(v)) throw new TypeError("stableStringify: circular reference");
      seen.add(v);
      if (Array.isArray(v)) {
        const items = v.map(x => _walk(x === undefined ? null : x));
        return "[" + items.join(",") + "]";
      }
      // Object: sort keys
      const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
      const parts = [];
      for (const k of keys) {
        parts.push(JSON.stringify(k) + ":" + _walk(v[k]));
      }
      return "{" + parts.join(",") + "}";
    }
    // functions, symbols, undefined -> null
    return "null";
  }
  return _walk(value);
}

/** Compute sha256 over the stable stringification of an object. Returns hex. */
export function sha256Canonical(value) {
  const s = stableStringify(value);
  return crypto.createHash("sha256").update(s).digest("hex");
}
