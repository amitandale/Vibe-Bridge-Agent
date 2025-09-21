// lib/context/retrievers/select.mjs
// Minimal shim to satisfy BA-S1 import expectations.
// Export both named and default to cover { selectRetriever }, { select }, and default import patterns.
export function selectRetriever() {
  return null;
}
export const select = selectRetriever;
export default selectRetriever;
