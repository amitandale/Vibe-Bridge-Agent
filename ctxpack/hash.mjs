import { createHash } from "node:crypto";
import { canonicalizePack } from "./canonicalize.mjs";

export function computePackHash(pack) {
  const copy = JSON.parse(JSON.stringify(pack));
  // Exclude top-level hash from the digest
  if (Object.prototype.hasOwnProperty.call(copy, "hash")) {
    delete copy.hash;
  }
  const s = canonicalizePack(copy);
  const h = createHash("sha256").update(s, "utf8").digest("hex");
  return h;
}
