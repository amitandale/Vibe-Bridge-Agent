/**
 * lib/vendors/autogen.client.mjs
 * AutoGen thin client using BA-S0 makeHttp().
 * runAgents({ teamConfig, messages, contextRefs, idempotencyKey })
 * -> { transcript, artifacts: { patches:[{path,diff}], tests:[{path,content}] } }
 */
import { makeHttp } from './http.mjs';

export function makeAutoGenClient({ baseUrl, projectId, kid, key, fetchImpl } = {}) {
  const http = makeHttp({ baseUrl: baseUrl || process.env.AUTOGEN_URL || '', projectId, kid, key, fetchImpl });
  async function runAgents({ teamConfig = {}, messages = [], contextRefs = [], idempotencyKey } = {}) {
    const body = { teamConfig, messages, contextRefs };
    const res = await http.post('/agents/run', { body, idempotencyKey, timeoutMs: 10_000 });
    // Pass through JSON
    const json = typeof res?.json === 'function' ? await res.json() : await (async () => {
      try { return JSON.parse(await res.text()); } catch { return {}; }
    })();
    const artifacts = json?.artifacts || {};
    return {
      transcript: json?.transcript ?? [],
      artifacts: {
        patches: Array.isArray(artifacts?.patches) ? artifacts.patches : [],
        tests: Array.isArray(artifacts?.tests) ? artifacts.tests : []
      }
    };
  }
  return { runAgents };
}

export default makeAutoGenClient;
