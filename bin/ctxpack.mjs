#!/usr/bin/env node
// CLI: node bin/ctxpack.mjs <validate|hash|print> <file>
import { readFileSync } from "node:fs";
import { validatePack } from "../ctxpack/validate.mjs";
import { computePackHash } from "../ctxpack/hash.mjs";
import { canonicalizePack } from "../ctxpack/canonicalize.mjs";

function usage() {
  console.log("Usage: node bin/ctxpack.mjs <validate|hash|print> <file>");
}

const [, , cmd, file] = process.argv;
if (!cmd || !file) {
  usage();
  process.exit(2);
}

function readJSON(p) {
  try {
    const s = readFileSync(p, "utf8");
    return JSON.parse(s);
  } catch (e) {
    console.error("Failed to read/parse JSON:", e.message);
    process.exit(2);
  }
}

const pack = readJSON(file);

if (cmd === "validate") {
  const allowMinor = process.env.BRIDGE_CTXPACK_ALLOW_MINOR === "1";
  const res = validatePack(pack, { allowMinor });
  if (!res.ok) {
    console.error("INVALID ContextPack:");
    for (const e of res.errors) console.error(" -", e);
    if (res.warnings.length) {
      console.error("Warnings:");
      for (const w of res.warnings) console.error(" -", w);
    }
    process.exit(1);
  } else {
    if (res.warnings.length) {
      console.error("Valid with warnings:");
      for (const w of res.warnings) console.error(" -", w);
    } else {
      console.log("Valid ContextPack");
    }
    process.exit(0);
  }
} else if (cmd === "hash") {
  const h = computePackHash(pack);
  console.log(h);
  process.exit(0);
} else if (cmd === "print") {
  const s = canonicalizePack(pack);
  process.stdout.write(s);
  process.exit(0);
} else {
  usage();
  process.exit(2);
}
