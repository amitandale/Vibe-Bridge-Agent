// ctxpack/hash.mjs
import { stableStringify, sha256Canonical } from "./canonicalize.mjs";

/** Return canonical JSON string for the whole pack. */
export function canonicalJSON(pack) {
  return stableStringify(pack);
}

/** Return sha256 hex for the canonicalized pack. */
export function packHash(pack) {
  return sha256Canonical(pack);
}
