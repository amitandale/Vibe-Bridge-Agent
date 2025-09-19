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

  const mode = decideMode({ prefer, env });

  // test adapter passthrough
  const adapters = opts.adapters || null;
  if (adapters && (adapters.codyRetrieve || adapters.llamaRetrieve)) {
    if (mode === 'cody' && adapters.codyRetrieve) return adapters.codyRetrieve;
    if (mode === 'llamaindex' && adapters.llamaRetrieve) return adapters.llamaRetrieve;
  }

  let resolved;
  return async function retrieve(ctx, q) {
    if (!resolved) {
      resolved = await loadAdapter(mode);
    }
    const res = await resolved(ctx, q);
    return normalizeArtifacts(res);
  };
}

function decideMode({ prefer, env }) {
  if (prefer === 'cody' || prefer === 'llamaindex' || prefer === 'llamaindex-remote') return prefer;
  const envPref = (env.BA_RETRIEVER || 'auto').toLowerCase();
  if (envPref === 'cody' || envPref === 'llamaindex' || envPref === 'llamaindex-remote') return envPref;
  return 'llamaindex';
}

async function loadAdapter(mode) {
  if (mode === 'cody') {
    try {
      const mod = await import('./cody.mjs');
      const fn = mod.retrieveWithCody ?? mod.default ?? mod.retrieve ?? null;
      if (typeof fn === 'function') return fn;
    } catch {}
    return async () => [];
  }

  if (mode === 'llamaindex-remote') {
    try {
      const modClient = await import('../../vendors/llamaindex.client.mjs');
      const makeClient = modClient.makeLlamaIndexClient ?? modClient.default ?? null;
      if (typeof makeClient === 'function') {
        return async (ctx, q) => {
          const env = ctx?.env || DEFAULT_ENV;
          const client = makeClient({ baseUrl: env.LLAMAINDEX_URL, fetchImpl: ctx?.fetch });
          const projectId = ctx?.projectId || env.PROJECT_ID || env.LI_PROJECT_ID || '';
          const topK = env.LI_TOP_K ? parseInt(env.LI_TOP_K, 10) : undefined;
          const out = await client.query({ projectId, q, topK });
          return Array.isArray(out?.items) ? out.items : (Array.isArray(out?.nodes) ? out.nodes : out);
        };
      }
    } catch {}
    return async () => [];
  }

  // llamaindex via packer
  try {
    try {
      const modLI = await import('../pack.llamaindex.mjs');
      const pack = modLI.pack ?? modLI.default ?? null;
      if (typeof pack === 'function') {
        return async (_ctx, q) => {
          try {
            return normalizeArtifacts(await pack({ query: q }));
          } catch {
            const mod = await import('../pack.mjs');
            const pack2 = mod.pack ?? mod.default ?? mod.createPack ?? null;
            if (typeof pack2 === 'function') return normalizeArtifacts(await pack2({ query: q }));
            return [];
          }
        };
      }
    } catch {}
    const mod = await import('../pack.mjs');
    const pack = mod.pack ?? mod.default ?? mod.createPack ?? null;
    if (typeof pack === 'function') {
      return async (_ctx, q) => normalizeArtifacts(await pack({ query: q }));
    }
  } catch {}
  return async () => [];
}

function normalizeArtifacts(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res.map(nor);
  if (Array.isArray(res.items)) return res.items.map(nor);
  if (Array.isArray(res.artifacts)) return res.artifacts.map(nor);
  if (Array.isArray(res.nodes)) return res.nodes.map(nor);
  if (Array.isArray(res.results)) return res.results.map(nor);
  if (Array.isArray(res.chunks)) return res.chunks.map(nor);
  return [nor(res)];
}

function nor(x) {
  if (x && typeof x === 'object') {
    return {
      id: x.id ?? x.path ?? x.name ?? 'artifact',
      kind: x.kind ?? x.type ?? 'doc',
      path: x.path ?? null,
      text: x.text ?? x.content ?? x.chunk ?? x.page_content ?? null,
      bytes: x.bytes ?? null,
      meta: x.meta ?? x.metadata ?? {}
    };
  }
  return { id: 'artifact', kind: 'doc', path: null, text: String(x), bytes: null, meta: {} };
}
