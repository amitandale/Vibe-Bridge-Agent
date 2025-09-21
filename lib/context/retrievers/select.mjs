// lib/context/retrievers/select.mjs
// Returns a retrieval function based on env/prefer or injected adapters.
// Contract used by tests:
// - selectRetriever({ prefer:'cody', adapters:{ codyRetrieve, llamaRetrieve }}) -> returns codyRetrieve
// - selectRetriever({ env:{ BA_RETRIEVER:'auto' }, adapters:{...}}) -> defaults to llamaRetrieve
// - selectRetriever({ env:{ BA_RETRIEVER:'llamaindex-remote', LI_TOP_K:'2', LLAMAINDEX_URL:'http://x' }}) ->
//     returns a function that POSTs to LLAMAINDEX_URL /query using makeLlamaIndexClient and returns nodes
import { makeLlamaIndexClient } from '../../vendors/llamaindex.client.mjs';

/**
 * @param {Object} opts
 * @param {Object} [opts.env] - optional env bag
 * @param {string} [opts.prefer] - 'cody' | 'llamaindex' | 'auto' | 'llamaindex-remote'
 * @param {Object} [opts.adapters] - injected retrievers for tests
 * @returns {(ctx: object, q: string) => Promise<Array>} retrieve function
 */
export function selectRetriever(opts = {}){
  const env = opts.env || {};
  const prefer = String(opts.prefer || env.BA_RETRIEVER || 'auto').toLowerCase();
  const cody = opts.adapters?.codyRetrieve;
  const llama = opts.adapters?.llamaRetrieve;

  // Prefer explicit adapters when provided
  if (prefer === 'cody' && typeof cody === 'function') return async (ctx, q) => cody(ctx, q);
  if ((prefer === 'llamaindex' || prefer === 'auto') && typeof llama === 'function') return async (ctx, q) => llama(ctx, q);

  // Remote llamaindex path
  if (prefer === 'llamaindex-remote') {
    return async function retrieve(ctx = {}, q = '') {
      const topK = Number((ctx.env?.LI_TOP_K ?? env.LI_TOP_K) ?? '5') || 5;
      const baseUrl = (ctx.env?.LLAMAINDEX_URL ?? env.LLAMAINDEX_URL) || undefined;
      const fetchImpl = ctx.fetch || globalThis.fetch;
      const client = makeLlamaIndexClient({ baseUrl, fetchImpl });
      const r = await client.query({ projectId: ctx.projectId || env.PROJECT_ID || '', q, topK });
      return Array.isArray(r?.nodes) ? r.nodes : [];
    };
  }

  // Fallback: prefer llama if injected, else a no-op retriever
  if (typeof llama === 'function') return async (ctx, q) => llama(ctx, q);
  if (typeof cody === 'function') return async (ctx, q) => cody(ctx, q);
  return async function retrieve(){ return []; };
}

export function select(opts = {}){ return selectRetriever(opts); }
export default { select, selectRetriever };
