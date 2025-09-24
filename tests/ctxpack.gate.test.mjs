import test from "node:test";
import assert from "node:assert/strict";
import { validatePack } from "../ctxpack/validate.mjs";
import { computePackHash } from "../ctxpack/hash.mjs";

test("gate-equivalent validation rejects when must_include > max_files", () => {
  const p = {
    version: "1.0.0",
    project: { id: "demo" },
    pr: { id: "1", branch: "work", commit_sha: "de46c84a65b022ad47e099630b9bb3db6e6f63c2" },
    mode: "PR",
    order: ["templates","spec_canvas","diff_slices","linked_tests","contracts","extras"],
    budgets: { max_tokens: 1000, max_files: 0, max_per_file_tokens: 400, section_caps: {
      templates:1, spec_canvas:1, diff_slices:0, linked_tests:0, contracts:0, extras:0
    } },
    must_include: [{
      kind:"code", section:"diff_slices", loc:{path:"src/a.mjs", start_line:1, end_line:1},
      sha256:"0"*64, source:"git"
    }],
    nice_to_have: [],
    never_include: [],
    provenance: [{ source:"planner", generator:"bridge-agent", created_at: new Date().toISOString() }],
    hash: ""
  };
  p.hash = computePackHash(p);
  const res = validatePack(p);
  assert.ok(!res.ok);
});
