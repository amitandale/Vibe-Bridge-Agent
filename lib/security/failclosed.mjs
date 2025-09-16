// lib/security/failclosed.mjs
// Fail-closed heartbeat: if the control plane cannot be reached or responds non-200, disable the agent.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Heartbeat the control plane.
 * @param {Object} opts
 * @param {string} opts.url - heartbeat endpoint
 * @param {Function} [opts.fetchImpl] - fetch implementation
 * @returns {Promise<{disabled: boolean, lastOk?: number}>}
 */
export async function heartbeat({ url, fetchImpl = globalThis.fetch }){
  try{
    const res = await fetchImpl(url, { method:'GET' });
    if (res.ok){
      return { disabled: false, lastOk: Date.now() };
    }
    // non-200 → fail closed
    return { disabled: true };
  } catch {
    // network fault → fail closed
    return { disabled: true };
  }
}

// convenience helper used by tests may call directly
export async function heartbeatSetsDisabledTrueFor500(fetchImpl){
  const { disabled } = await heartbeat({ url: 'https://example.invalid/hb', fetchImpl });
  return disabled;
}
