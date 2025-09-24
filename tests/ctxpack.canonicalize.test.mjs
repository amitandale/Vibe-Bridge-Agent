import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJSONStringify, canonicalizeObject } from "../ctxpack/canonicalize.mjs";

test("canonicalization is stable and sorts keys", () => {
  const a = { b: 1, a: 2, z: { y: 1, x: 2 }, arr: [{ q: 2, p: 1 }] };
  const b = { z: { x: 2, y: 1 }, a: 2, arr: [{ p: 1, q: 2 }], b: 1 };
  const sa = canonicalJSONStringify(a);
  const sb = canonicalJSONStringify(b);
  assert.equal(sa, sb);
  const obj = JSON.parse(sa);
  assert.deepEqual(obj, canonicalizeObject(b));
});
