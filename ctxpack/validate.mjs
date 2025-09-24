// ctxpack/validate.mjs
import { ContextPackV1Shape } from "./schema.mjs";

/** Validate a candidate "ContextPack v1" object. No external deps. */
export function validateContextPack(pack) {
  const errors = [];
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    errors.push("pack must be an object");
    return { ok: false, errors };
  }
  if (pack.version !== "1") {
    errors.push("version must equal '1'");
  }
  if (!pack.meta || typeof pack.meta !== "object" || Array.isArray(pack.meta)) {
    errors.push("meta must be an object");
  } else {
    const { project, commit, created_at } = pack.meta;
    if (!project || typeof project !== "string") errors.push("meta.project required string");
    if (!commit || typeof commit !== "string") errors.push("meta.commit required string");
    if (!created_at || typeof created_at !== "string") errors.push("meta.created_at required ISO string");
  }
  if (!Array.isArray(pack.sections)) {
    errors.push("sections must be an array");
  } else {
    for (let i = 0; i < pack.sections.length; i++) {
      const s = pack.sections[i];
      if (!s || typeof s !== "object" || Array.isArray(s)) { errors.push(`sections[${i}] must be object`); continue; }
      if (!s.name || typeof s.name !== "string") errors.push(`sections[${i}].name required string`);
      if (s.budget_tokens !== undefined && (!Number.isInteger(s.budget_tokens) || s.budget_tokens < 0)) {
        errors.push(`sections[${i}].budget_tokens must be non-negative integer when present`);
      }
      if (!Array.isArray(s.slices)) { errors.push(`sections[${i}].slices must be array`); continue; }
      for (let j = 0; j < s.slices.length; j++) {
        const sl = s.slices[j];
        if (!sl || typeof sl !== "object" || Array.isArray(sl)) { errors.push(`sections[${i}].slices[${j}] must be object`); continue; }
        if (!sl.id || typeof sl.id !== "string") errors.push(`sections[${i}].slices[${j}].id required string`);
        if (!sl.content || typeof sl.content !== "string") errors.push(`sections[${i}].slices[${j}].content required string`);
        if (!sl.hash || typeof sl.hash !== "string" || !/^[a-f0-9]{64}$/.test(sl.hash)) {
          errors.push(`sections[${i}].slices[${j}].hash required sha256 hex`);
        }
        if (sl.must_include !== undefined && typeof sl.must_include !== "boolean") {
          errors.push(`sections[${i}].slices[${j}].must_include must be boolean when present`);
        }
        if (sl.never_include !== undefined && typeof sl.never_include !== "boolean") {
          errors.push(`sections[${i}].slices[${j}].never_include must be boolean when present`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
