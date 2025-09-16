// lib/security/matrix.mjs
/**
 * Determine if the agent may run in serverless mode.
 * Requires both a request signature and a ticket.
 * @param {Object} opts
 * @param {string|undefined} opts.signature
 * @param {string|undefined} opts.ticket
 * @returns {boolean}
 */
export function runAgentAllowedServerless({ signature, ticket }){
  return Boolean(signature) && Boolean(ticket);
}

/**
 * Backward-compat name used in older tests.
 */
export function runAgentAllowed(opts){
  return runAgentAllowedServerless(opts);
}
