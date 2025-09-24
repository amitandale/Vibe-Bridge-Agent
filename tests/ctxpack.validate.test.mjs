import test from "node:test";
import assert from "node:assert/strict";
import { validatePack } from "../ctxpack/validate.mjs";
import { computePackHash } from "../ctxpack/hash.mjs";

function goodPack() {
  const p = {
    version: "1.0.0",
    project: { id: "demo" },
    pr: { id: "1", branch: "work", commit_sha: "de46c84a65b022ad47e099630b9bb3db6e6f63c2" },
    mode: "PR",
    order: ["templates","spec_canvas","diff_slices","linked_tests","contracts","extras"],
    budgets: { max_tokens: 1000, max_files: 2, max_per_file_tokens: 400, section_caps: {
      templates:1, spec_canvas:1, diff_slices:2, linked_tests:2, contracts:1, extras:1
    } },
    must_include: [{
      kind:"code", section:"diff_slices", loc:{path:"src/a.mjs", start_line:1, end_line:1},
      sha256:"0"*64, source:"git"
    }],
    nice_to_have: [],
    never_include: ["**/*.lock"],
    provenance: [{ source:"planner", generator:"bridge-agent", created_at: new Date().toISOString() }],
    hash: ""
  };
  p.hash = computePackHash(p);
  return p;
}

test("valid pack passes", () => {
  const p = goodPack();
  const res = validatePack(p);
  assert.ok(res.ok, "expected valid pack");
});

test("unknown top-level keys are rejected", () => {
  const p = goodPack();
  p.unknown = 1;
  p.hash = computePackHash(p);
  const res = validatePack(p);
  assert.ok(!res.ok);
  assert.match(res.errors.join("\n"), /unknown top-level keys/);
});

test("must_include over cap fails", () => {
  const p = goodPack();
  p.must_include.push({
    kind:"code", section:"diff_slices", loc:{path:"src/b.mjs", start_line:1, end_line:1},
    sha256:"0"*64, source:"git"
  });
  p.must_include.push({
    kind:"code", section:"diff_slices", loc:{path:"src/c.mjs", start_line:1, end_line:1},
    sha256:"0"*64, source:"git"
  });
  p.hash = computePackHash(p);
  const res = validatePack(p);
  assert.ok(!res.ok);
  assert.match(res.errors.join("\n"), /exceeds cap/);
});

test("never_include blocks paths", () => {
  const p = goodPack();
  p.never_include.push("src/*.mjs");
  p.hash = computePackHash(p);
  const res = validatePack(p);
  assert.ok(!res.ok);
  assert.match(res.errors.join("\n"), /is blocked by never_include/);
});

test("version mismatch fails without minor allow", () => {
  const p = goodPack();
  p.version = "1.1.0";
  p.hash = computePackHash(p);
  const res = validatePack(p);
  assert.ok(!res.ok);
});

test("minor version allowed with flag produces warning", () => {
  const p = goodPack();
  p.version = "1.1.0";
  p.hash = computePackHash(p);
  const res = validatePack(p, { allowMinor: true });
  assert.ok(res.ok);
  assert.ok(res.warnings.length > 0);
});
