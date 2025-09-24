// scripts/preflight/ctxpack.preflight.mjs
// No-op preflight that can be wired later. Exits non-zero on validation failure when enabled.
import fs from "node:fs";
import { validateContextPack } from "../../ctxpack/validate.mjs";

if (process.env.BRIDGE_CTXPACK_PREFLIGHT !== "1") {
  console.log("ctxpack preflight disabled");
  process.exit(0);
}
const file = process.env.CTXPACK_FILE || "examples/contextpack.mvp.json";
const raw = fs.readFileSync(file, "utf8");
const obj = JSON.parse(raw);
const res = validateContextPack(obj);
if (!res.ok) {
  console.error("ctxpack preflight failed:", res.errors);
  process.exit(1);
}
console.log("ctxpack preflight ok");
