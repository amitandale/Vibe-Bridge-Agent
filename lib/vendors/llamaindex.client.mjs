import { makeHttp } from './http.mjs';
import { getVendorConfig } from './config.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;

function pickProjectId(explicit, fallback) {
  return explicit || fallback || (typeof process !== 'undefined' ? process.env.PROJECT_ID : '') || 'default';
}

export function makeLlamaIndexClient({ baseUrl, projectId, kid, key, fetchImpl } = {}) {
  const cfg = (baseUrl || projectId || kid || key)
    ? { baseUrl: baseUrl || '', projectId, kid, key }
    : getVendorConfig('llamaindex');
  const http = makeHttp({ ...cfg, fetchImpl });

  async function upsert({ projectId, docs, idempotencyKey } = {}) {
    if (!Array.isArray(docs) || docs.length === 0) throw new Error('docs[] required');
    const pid = pickProjectId(projectId, cfg.projectId);
    const body = { projectId: pid, docs, idempotencyKey };
    const res = await http.post('/index/upsert', { body, idempotencyKey, timeoutMs: DEFAULT_TIMEOUT_MS });
    return res.data;
  }

  async function query({ projectId, query, k, hints } = {}) {
    if (!query || typeof query !== 'string') throw new Error('query required');
    const pid = pickProjectId(projectId, cfg.projectId);
    const body = { projectId: pid, query, k, hints };
    const res = await http.post('/query', { body, timeoutMs: DEFAULT_TIMEOUT_MS });
    return res.data;
  }

  return { upsert, query };
}
