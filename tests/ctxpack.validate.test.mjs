// tests/ctxpack.validate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContextPack } from "../ctxpack/validate.mjs";

const valid = {
  version: "1",
  meta: { project: "proj", commit: "abc123", created_at: "2025-09-24T00:00:00Z" },
  sections: [
    { name: "CODE", budget_tokens: 1000, slices: [
      { id: "a", content: "x", hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    ] }
  ]
};

test("ctxpack.validate: accepts a minimal valid pack", () => {
  const res = validateContextPack(valid);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("ctxpack.validate: rejects wrong version", () => {
  const bad = structuredClone(valid);
  bad.version = "2";
  const res = validateContextPack(bad);
  assert.equal(res.ok, false);
});

test("ctxpack.validate: rejects invalid slice hash", () => {
  const bad = structuredClone(valid);
  bad.sections[0].slices[0].hash = "not-a-hash";
  const res = validateContextPack(bad);
  assert.equal(res.ok, false);
});
