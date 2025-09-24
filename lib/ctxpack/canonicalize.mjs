// Stable canonical JSON stringify with lexicographic key order and no insignificant whitespace.
import { TextEncoder } from 'node:util';

function _sort(value) {
  if (Array.isArray(value)) {
    return value.map(_sort);
  } else if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = _sort(value[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJSONStringify(obj) {
  const sorted = _sort(obj);
  // Do not pretty-print. Canonical form is a single line with minimal spaces.
  return JSON.stringify(sorted);
}

export function toCanonicalBytes(obj) {
  const s = canonicalJSONStringify(obj);
  return new TextEncoder().encode(s);
}
