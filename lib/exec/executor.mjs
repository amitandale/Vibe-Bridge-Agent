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
/* === BA-S3: Remote exec path (surgical, additive) === */
async function __resolveOpenDevinClient() {
  if (globalThis.__opendevinClient) return globalThis.__opendevinClient;
  try {
    const mod = await import("../vendors/opendevin.client.mjs");
    return mod?.default || mod;
  } catch (_e) {
    // No client available; return stub that throws when used.
    return {
      async exec() {
        const err = new Error("OpenDevin client not available");
        err.code = "UPSTREAM_UNAVAILABLE";
        throw err;
      }
    };
  }
}

/**
 * execute_remote: uses OpenDevin/OpenHands to run commands when EXEC_MODE=remote.
 * Plan shape: { exec: { cwd, shell, commands, env, timeoutMs } }
 * Returns: { ok, stdout, stderr, exitCode, durationMs }
 */
export async function execute_remote(options = {}) {
  const planExec = options?.plan?.exec || {};
  const cwd = String(planExec.cwd || options?.ctx?.projectRoot || process.cwd());
  const shell = String(planExec.shell || "bash");
  const commands = Array.isArray(planExec.commands) ? planExec.commands : [];
  const env = (planExec.env && typeof planExec.env === 'object') ? planExec.env : {};
  const timeoutMs = Number.isFinite(planExec.timeoutMs) ? planExec.timeoutMs : undefined;
  const idempotencyKey = String(options?.idempotencyKey || options?.plan?.idempotencyKey || "");

  const client = await __resolveOpenDevinClient();
  const res = await client.exec({ cwd, shell, commands, env, timeoutMs, idempotencyKey });
  const out = {
    ok: Number(res?.exitCode ?? 0) === 0,
    stdout: String(res?.stdout ?? ""),
    stderr: String(res?.stderr ?? ""),
    exitCode: Number(res?.exitCode ?? 0),
    durationMs: Number(res?.durationMs ?? 0)
  };
  return out;
}

/**
 * pickExecute: env-gated dispatcher without changing existing execute().
 * Uses execute_remote when EXEC_MODE=remote, else falls back to execute().
 */
export async function pickExecute(options = {}) {
  const mode = String(process.env.EXEC_MODE || "").toLowerCase();
  if (mode === "remote") {
    return execute_remote(options);
  }
  return execute(options);
}

// Default export helper for convenience
export default { execute, pickExecute, execute_remote };
