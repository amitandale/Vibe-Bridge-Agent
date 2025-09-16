/**
 * DevOps executor with retriever dependency injection.
 * No behavior change to budgets or orchestration.
 * Default retriever is lazy and optional.
 * No PR identifiers in code.
 */

export async function execute(options = {}) {
  const { plan = {}, ctx = {}, retrieve } = options;

  const retrieveFn = typeof retrieve === "function" ? retrieve : defaultRetrieve;

  // Shallow freeze input plan to guard mutations
  const planSnapshot = JSON.stringify(plan);

  // Minimal flow: prepare a retrieval query derived from plan
  const q = deriveQuery(plan);

  // Call retriever once. Must not throw for unknown retrievers.
  let retrieved = [];
  try {
    retrieved = await retrieveFn(ctx, q);
  } catch (_err) {
    // Keep executor resilient. Retrieval is optional.
    retrieved = [];
  }

  // Verify plan immutability at this layer
  const samePlan = planSnapshot === JSON.stringify(plan);

  return {
    ok: true,
    samePlan,
    retrieved,
  };
}

function deriveQuery(plan) {
  // Keep deterministic: if plan has a title or goal, use it; else empty query.
  if (plan && typeof plan === "object") {
    if (typeof plan.query === "string") return plan.query;
    if (typeof plan.goal === "string") return plan.goal;
    if (Array.isArray(plan.steps) && plan.steps.length > 0) {
      const first = plan.steps[0];
      if (first && typeof first.desc === "string") return first.desc;
      if (first && typeof first.name === "string") return first.name;
    }
  }
  return "";
}

async function defaultRetrieve(ctx, q) {
  // Lazy import to avoid hard dependency if packer is not present in env.
  try {
    const mod = await import("../context/pack.mjs");
    const pack = mod.pack ?? mod.default ?? mod.createPack ?? null;
    if (!pack) return [];
    const res = await pack(ctx, { query: q });
    if (!res) return [];
    // Normalize common shapes
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.items)) return res.items;
    if (Array.isArray(res.artifacts)) return res.artifacts;
    return [res];
  } catch (_err) {
    // Executor remains operational even if packer is absent.
    return [];
  }
}
