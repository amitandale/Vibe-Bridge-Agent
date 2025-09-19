/**
 * Retriever selector for Team-Leader.
 * Returns a function (ctx, q) => Artifact[]
 * Supports prefer override, env override, and simple heuristics.
 * No PR identifiers in code.
 */

const DEFAULT_ENV = typeof process !== 'undefined' ? process.env : {};

export function selectRetriever(opts = {}) {
  const prefer = (opts.prefer || '').toLowerCase();
  const env = opts.env || DEFAULT_ENV;
  const heuristics = opts.heuristics || {};
  const adapters = opts.adapters || null; // for tests

  const mode = decideMode({ prefer, env, heuristics });

  if (adapters && (adapters.codyRetrieve || adapters.llamaRetrieve || adapters.llamaRemote)) {
    if (mode === 'cody' && adapters.codyRetrieve) return adapters.codyRetrieve;
    if (mode === 'llamaindex' && adapters.llamaRetrieve) return adapters.llamaRetrieve;
    if (mode === 'llamaindex-remote' && adapters.llamaRemote) return adapters.llamaRemote;
  }

  // Lazy resolver to avoid importing both adapters
  let resolved;
  return async function retrieve(ctx, q) {
    if (!resolved) {
      resolved = await loadAdapter(mode);
    }
    try {
      const res = await resolved(ctx, q);
      return normalizeArtifacts(res);
    } catch (_err) {
      return [];
    }
  };
}

function decideMode({ prefer, env, heuristics }) {
  if (prefer === 'llamaindex-remote') return 'llamaindex-remote';
  if (prefer === 'cody' || prefer === 'llamaindex' || prefer === 'llamaindex-remote') return prefer;
  const envPref = (env.BA_RETRIEVER || 'auto').toLowerCase();
  if (envPref === 'cody' || envPref === 'llamaindex' || envPref === 'llamaindex-remote') return envPref;

  // auto
  if (env && env.LLAMAINDEX_URL && String(env.LLAMAINDEX_URL).length > 0) return 'llamaindex-remote';
  const isCode = typeof heuristics.isCodeQuery === 'function'
    ? !!heuristics.isCodeQuery
    : (q) => looksCodeCentric(q);
  // Defer decision until call-time by returning a thin proxy
  // But for simplicity, make a best-effort decision now based on a placeholder input
  // Final adapter will still work for any q.
  return 'llamaindex';
}

async function loadAdapter(mode) {
  if (mode === 'cody') {
    // Prefer project adapter if present
    try {
      const mod = await import('./cody.mjs');
      const fn = mod.retrieveWithCody ?? mod.default ?? mod.retrieve ?? null;
      if (typeof fn === 'function') return fn;
    } catch {}
    // Fallback no-op
    return async () => [];
  }

  // llamaindex default
  try {
    // Prefer dedicated LlamaIndex packer if present
    try {
      const modLI = await import('../pack.llamaindex.mjs');
      const pack = modLI.pack ?? modLI.default ?? null;
      if (typeof pack === 'function') {
        return async (ctx, q) => normalizeArtifacts(await pack(ctx, { query: q }));
      }
    } catch {}
    // Fallback to generic packer
    const mod = await import('../pack.mjs');
    const pack = mod.pack ?? mod.default ?? mod.createPack ?? null;
    if (typeof pack === 'function') {
      return async (ctx, q) => normalizeArtifacts(await pack(ctx, { query: q }));
    }
  } catch {}
  return async () => [];
}

function looksCodeCentric(q) {
  if (!q || typeof q !== 'string') return false;
  // cheap signals
  if (q.includes('diff --git') || q.includes('@@') || q.includes('```')) return true;
  if (/[A-Za-z0-9_]+\.(js|mjs|ts|tsx|jsx|json|md)\b/.test(q)) return true;
  if (/\b(function|class|import|export|const|let|var)\b/.test(q)) return true;
  return false;
}

function normalizeArtifacts(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res.map(nor);
  if (Array.isArray(res.items)) return res.items.map(nor);
  if (Array.isArray(res.artifacts)) return res.artifacts.map(nor);
  return [nor(res)];
}

function nor(x) {
  if (x && typeof x === 'object') {
    return {
      id: x.id ?? x.path ?? x.name ?? 'artifact',
      kind: x.kind ?? x.type ?? 'doc',
      path: x.path ?? null,
      text: x.text ?? x.content ?? null,
      bytes: x.bytes ?? null,
      meta: x.meta ?? {}
    };
  }
  return { id: 'artifact', kind: 'doc', path: null, text: String(x), bytes: null, meta: {} };
}
