// bin/ctxpack.mjs
import fs from "node:fs";
import { validateContextPack } from "../ctxpack/validate.mjs";
import { canonicalJSON, packHash } from "../ctxpack/hash.mjs";

function usage() {
  console.log("Usage: node bin/ctxpack.mjs <validate|hash|print> <file.json>");
  process.exitCode = 2;
}

const [, , cmd, file] = process.argv;
if (!cmd || !file) { usage(); process.exit(); }

const raw = fs.readFileSync(file, "utf8");
let obj;
try {
  obj = JSON.parse(raw);
} catch (e) {
  console.error("Invalid JSON:", e.message);
  process.exit(1);
}

if (cmd === "validate") {
  const res = validateContextPack(obj);
  if (!res.ok) {
    console.error("invalid:", JSON.stringify(res.errors, null, 2));
    process.exit(1);
  }
  console.log("ok");
  process.exit(0);
} else if (cmd === "hash") {
  console.log(packHash(obj));
  process.exit(0);
} else if (cmd === "print") {
  console.log(canonicalJSON(obj));
  process.exit(0);
} else {
  usage();
}
