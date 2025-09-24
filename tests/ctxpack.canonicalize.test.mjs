// tests/ctxpack.canonicalize.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { stableStringify } from "../ctxpack/canonicalize.mjs";

test("ctxpack.canonicalize: stable key ordering", () => {
  const obj = { b: 1, a: { y: 2, x: 1 } };
  const s = stableStringify(obj);
  assert.equal(s, '{"a":{"x":1,"y":2},"b":1}');
});

test("ctxpack.canonicalize: array order preserved", () => {
  const obj = { a: [3,2,1] };
  const s = stableStringify(obj);
  assert.equal(s, '{"a":[3,2,1]}');
});
