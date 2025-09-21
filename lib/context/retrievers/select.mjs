// lib/context/retrievers/select.mjs
import { makeLlamaIndexClient } from '../../vendors/llamaindex.client.mjs';

export function selectRetriever(opts = {}){
  const env = opts.env || {};
  const prefer = String(opts.prefer || env.BA_RETRIEVER || 'auto').toLowerCase();
  const cody = opts.adapters?.codyRetrieve;
  const llama = opts.adapters?.llamaRetrieve;

  if (prefer === 'cody' && typeof cody === 'function') return async (ctx, q) => cody(ctx, q);
  if ((prefer === 'llamaindex' || prefer === 'auto') && typeof llama === 'function') return async (ctx, q) => llama(ctx, q);

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

  if (typeof llama === 'function') return async (ctx, q) => llama(ctx, q);
  if (typeof cody === 'function') return async (ctx, q) => cody(ctx, q);
  return async function retrieve(){ return []; };
}

export function select(opts = {}){ return selectRetriever(opts); }
export default { select, selectRetriever };
