// lib/github/tokenBroker.mjs
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import crypto from 'node:crypto';

/**
 * Compute base64url(HMAC-SHA256(secret, body))
 */
function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function hmac(body, secret){
  const h = crypto.createHmac('sha256', String(secret));
  h.update(typeof body === 'string' ? body : JSON.stringify(body));
  return b64u(h.digest());
}

function getEnv(opts){
  const env = { ...(process?.env || {}), ...(opts?.env || {}) };
  const baseUrl = env.SaaS_URL || env.VIBE_SAAS_URL || env.SAAS_URL;
  const agentId = env.AGENT_ID || env.VIBE_AGENT_ID;
  const agentSecret = env.AGENT_SECRET || env.VIBE_AGENT_SECRET;
  if (!baseUrl) throw new Error('MISSING_SAAS_URL');
  if (!agentId || !agentSecret) throw new Error('MISSING_AGENT_CREDENTIALS');
  return { baseUrl, agentId, agentSecret };
}

function doRequest(urlStr, { method = 'POST', headers = {}, body = '' } = {}){
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method,
      headers: { 'content-type': 'application/json', ...headers },
      timeout: 10000,
    }, (res) => {
      let data='';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const code = res.statusCode || 0;
        if (code < 200 || code >= 300) {
          const err = new Error(`broker_http_${code}`);
          err.statusCode = code;
          err.body = data;
          return reject(err);
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function postSigned(pathname, payload, opts){
  const { baseUrl, agentId, agentSecret } = getEnv(opts);
  const url = new URL(pathname, baseUrl).toString();
  const body = JSON.stringify(payload || {});
  const sig = hmac(body, agentSecret);
  const headers = {
    'x-agent-id': agentId,
    'x-agent-signature': sig,
  };
  const json = await doRequest(url, { method: 'POST', headers, body });
  return json;
}

/** Returns installation access token { token, expiresAt } */
export async function getInstallationToken({ owner, repo }, opts = {}){
  if (!owner || !repo) throw new Error('MISSING_OWNER_OR_REPO');
  return await postSigned('/broker/github/installation-token', { owner, repo }, opts);
}

/** Returns runner registration token { token, expiresAt } */
export async function getRunnerRegistrationToken({ owner, repo }, opts = {}){
  if (!owner || !repo) throw new Error('MISSING_OWNER_OR_REPO');
  return await postSigned('/broker/github/runner-registration-token', { owner, repo }, opts);
}


/** Convenience: fetch installation token for a bound project */
export async function getInstallationTokenForProject(projectId, opts={}){
  if (!projectId) throw new Error('MISSING_PROJECT_ID');
  const proj = await import('../repo/projects.mjs');
  const row = proj.get(projectId);
  const owner = row?.repo_owner || row?.owner || '';
  const repo  = row?.repo_name  || row?.repo  || '';
  if (!owner || !repo) throw new Error('PROJECT_NOT_BOUND');
  return getInstallationToken({ owner, repo }, opts);
}

/** Convenience: fetch runner registration token for a bound project */
export async function getRunnerRegistrationTokenForProject(projectId, opts={}){
  if (!projectId) throw new Error('MISSING_PROJECT_ID');
  const proj = await import('../repo/projects.mjs');
  const row = proj.get(projectId);
  const owner = row?.repo_owner || row?.owner || '';
  const repo  = row?.repo_name  || row?.repo  || '';
  if (!owner || !repo) throw new Error('PROJECT_NOT_BOUND');
  return getRunnerRegistrationToken({ owner, repo }, opts);
}
