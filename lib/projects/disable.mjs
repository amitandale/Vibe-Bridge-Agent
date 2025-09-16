/**
 * lib/projects/disable.mjs
 * Project disable flag check. Placeholder for DB-backed lookup.
 */

const disabled = new Set();

export async function isDisabled(projectId) {
  return disabled.has(projectId);
}

// For admin scripts or tests
export async function setDisabled(projectId, flag) {
  if (flag) disabled.add(projectId);
  else disabled.delete(projectId);
}