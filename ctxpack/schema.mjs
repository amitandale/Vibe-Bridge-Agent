// ctxpack/schema.mjs
// ContextPack v1 minimal JSON "shape" schema for alignment only.
// This is an informal schema used by our local validator; not a JSON Schema draft dependency.
export const ContextPackV1Shape = Object.freeze({
  version: "1",
  requiredTop: ["version", "meta", "sections"],
  sectionOrder: ["META", "PR", "CODE", "TESTS", "SPECS", "API", "DB", "LOGS", "HINTS"],
});
