/**
 * CI type shims for JS-only security modules.
 * Scope: satisfy TS7016 in API route .ts files without altering runtime behavior.
 */
declare module "../../../../../lib/security/*.mjs" {
  export const requireBridgeGuardsAsync: any;
  export const requireBridgeGuards: any;
  export const _seed: any;
  export const _rotate: any;
  const _default: any;
  export default _default;
}
