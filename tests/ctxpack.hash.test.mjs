// tests/ctxpack.hash.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { packHash } from "../ctxpack/hash.mjs";

test("ctxpack.hash: deterministic over key order", () => {
  const a = { version: "1", meta: { project: "p", commit: "c", created_at: "t" }, sections: [] };
  const b = { sections: [], meta: { created_at: "t", commit: "c", project: "p" }, version: "1" };
  assert.equal(packHash(a), packHash(b));
});

test("ctxpack.hash: ignores undefined properties", () => {
  const a = { version: "1", meta: { project: "p", commit: "c", created_at: "t" }, sections: [], extra: undefined };
  const b = { version: "1", meta: { project: "p", commit: "c", created_at: "t" }, sections: [] };
  assert.equal(packHash(a), packHash(b));
});
