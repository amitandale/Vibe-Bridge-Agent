// Bridge-Agent preflight gate for ContextPack v1
// Behavior: warning mode by default. Enforce with BRIDGE_CTXPACK_ENFORCE=1
import { readFileSync } from "node:fs";
import { validatePack } from "../../ctxpack/validate.mjs";

function env(name, dflt) { return process.env[name] ?? dflt; }

const enforce = env("BRIDGE_CTXPACK_ENFORCE", "0") === "1";
const path = process.argv[2] || env("CTXPACK_PATH", "");

if (!path) {
  console.error("ctxpack gate: CTXPACK_PATH unset and no path argument provided");
  process.exit(enforce ? 1 : 0);
}

let pack;
try {
  pack = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.error(`ctxpack gate: cannot read pack at ${path}: ${e.message}`);
  process.exit(enforce ? 1 : 0);
}

const allowMinor = env("BRIDGE_CTXPACK_ALLOW_MINOR", "0") === "1";
const res = validatePack(pack, { allowMinor });

if (!res.ok) {
  console.error("ctxpack gate: invalid pack:");
  for (const e of res.errors) console.error(" -", e);
  process.exit(enforce ? 1 : 0);
} else {
  if (res.warnings.length) {
    console.error("ctxpack gate: valid with warnings:");
    for (const w of res.warnings) console.error(" -", w);
  } else {
    console.log("ctxpack gate: valid");
  }
  process.exit(0);
}
