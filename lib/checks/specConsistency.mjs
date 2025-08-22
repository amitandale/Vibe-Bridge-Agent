// PR-BShift-05 — Bridge-side executor for spec/plan validators as a GitHub Check.
// This module runs validators (abstracted) and produces a concise check result shape.
// Note: heavy execution lives here; vibe-ci only consumes the summary.
//
// In real usage, replace `validateSpec`/`validatePlan` with adapters that load repo files
// and run the actual validators. This file focuses on the orchestration shape.

// These tiny helpers stand in for real validators to keep tests hermetic.
function validateSpec(spec = "") {
  if (typeof spec !== "string") return { ok: false, message: "invalid spec type" };
  if (spec.includes("FAIL")) return { ok: false, message: "spec failed rule X" };
  return { ok: true };
}
function validatePlan(plan = "") {
  if (typeof plan !== "string") return { ok: false, message: "invalid plan type" };
  if (plan.includes("FAIL")) return { ok: false, message: "plan failed rule Y" };
  return { ok: true };
}

/**
 * Runs validators and returns a check payload suitable for GH Checks API
 * and for persisting into vibe-ui DB.
 * @param {object} input
 * @param {string} input.owner
 * @param {string} input.repo
 * @param {string} [input.ref]
 * @param {string} [input.spec]
 * @param {string} [input.plan]
 * @returns {{ ok: boolean, name: string, output: { title: string, summary: string }, details?: object }}
 */
export async function runSpecConsistencyCheck(input = {}) {
  const name = "vibe/spec-consistency";
  const spec = input.spec ?? "";
  const plan = input.plan ?? "";
  const s = validateSpec(spec);
  const p = validatePlan(plan);

  const ok = !!(s.ok && p.ok);
  const messages = [];
  if (!s.ok) messages.push(`Spec: ${s.message}`);
  if (!p.ok) messages.push(`Plan: ${p.message}`);

  return {
    ok,
    name,
    output: {
      title: ok ? "Spec & Plan Consistent" : "Spec/Plan Inconsistency",
      summary: ok ? "All checks passed." : messages.join("\n")
    },
    details: { specOk: !!s.ok, planOk: !!p.ok }
  };
}
export default { runSpecConsistencyCheck };
