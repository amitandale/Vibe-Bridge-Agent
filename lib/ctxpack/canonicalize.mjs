// Canonical JSON: stable key order, UTF-8, minimal whitespace.
import { TextEncoder } from 'node:util';

function _sort(value) {
  if (Array.isArray(value)) return value.map(_sort);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = _sort(value[k]);
    return out;
  }
  return value;
}

export function canonicalJSONStringify(obj) {
  const sorted = _sort(obj);
  return JSON.stringify(sorted);
}

export function toCanonicalBytes(obj) {
  return new TextEncoder().encode(canonicalJSONStringify(obj));
}
