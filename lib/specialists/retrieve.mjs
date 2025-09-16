// Specialists scoped retrieval adapter. No network for specialists.
import { pack } from '../context/pack.mjs';

function env(name, fallback=null){ return process.env[name] ?? fallback; }
function toInt(v, def){ const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : def; }

// Convert token cap → char cap. Approx 4 chars/token unless PLAN_PACK_BYTES is provided.
function computeMaxChars() {
  const capTokens = toInt(env('SPECIALIST_CONTEXT_CAP_TOKENS', null), null);
  const planBytes = toInt(env('PLAN_PACK_BYTES', null), null);
  if (capTokens != null) return capTokens * 4;
  if (planBytes != null) return planBytes;
  return 200_000; // default
}

/**
 * retrieve(ctx, query, opts) -> { artifacts }
 * ctx: { repoRoot?: string, redact?: function }
 * opts: { maxTokens?: number }
 *
 * Deterministic order, strict caps, no network usage.
 */
export async function retrieve(ctx = {}, query = '', opts = {}) {
  const repoRoot = ctx.repoRoot || '.';
  const redact = ctx.redact || null;
  // Respect explicit maxTokens, else derive from envs
  const maxTokens = toInt(opts.maxTokens, null);
  const maxChars = maxTokens != null ? maxTokens * 4 : computeMaxChars();

  // No network for specialists: do not pass any external retriever through.
  // BA-32 limits/redaction still apply via the packer.
  const res = await pack({
    repoRoot,
    query: String(query || ''),
    budget: { maxChars, maxFiles: 50 },
    redact,
    retriever: null,
  });

  const items = Array.isArray(res?.artifacts) ? res.artifacts.slice() : [];
  // Deterministic ordering by path, then content length
  items.sort((a,b) => {
    const ap = String(a.path || ''), bp = String(b.path || '');
    if (ap < bp) return -1; if (ap > bp) return 1;
    return (String(a.content||'').length - String(b.content||'').length);
  });
  return { artifacts: items };
}

export default { retrieve };
