// tests/_harness.mjs
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
// Minimal fetch stub registry
const _m = new Map();
export function mock(url, { status = 200, headers = {}, body = '' } = {}) {
  _m.set(String(url), { status, headers, body });
}
export function resetMocks(){ _m.clear(); }
export async function fetch(url){
  const e = _m.get(String(url));
  if (!e) return { ok:false, status:404, text: async()=> 'not mocked' };
  return {
    ok: e.status >= 200 && e.status < 300,
    status: e.status,
    headers: e.headers,
    text: async()=> String(e.body),
    json: async()=> JSON.parse(e.body)
  };
}
globalThis.fetch = fetch;

export function getEnv(name, fallback){
  if (process.env[name] != null) return process.env[name];
  if (arguments.length === 2) return fallback;
  throw new Error(`Missing env var: ${name}`);
}

export async function withFakeNow(epochMs, fn){
  const real = Date.now;
  Date.now = () => epochMs;
  try { return await fn(); } finally { Date.now = real; }
}

export { assert, sleep };
