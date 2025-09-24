import test from "node:test";
import assert from "node:assert/strict";
import { computePackHash } from "../ctxpack/hash.mjs";

test("hash excludes top-level hash field", () => {
  const pack = { version: "1.0.0", project: {id:"x"}, pr:{id:"1",branch:"b",commit_sha:"deadbeef"}, mode:"PR",
    order:["templates"], budgets:{max_tokens:1,max_files:0,max_per_file_tokens:1,section_caps:{templates:0}},
    must_include:[], nice_to_have:[], never_include:[], provenance:[], hash:"" };
  const h1 = computePackHash(pack);
  const h2 = computePackHash({...pack, hash:"ff"*32});
  assert.equal(h1, h2);
});
