// test/harness.mjs
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';

export function getEnv(name, fallback = undefined) {
  if (process.env[name] != null) return process.env[name];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env var: ${name}`);
}

export function fixture(...parts) {
  const file = path.join(process.cwd(), 'test', 'fixtures', ...parts);
  return fs.readFileSync(file, 'utf8');
}

const registry = new Map();
export function mock(url, { status = 200, headers = {}, body = '' } = {}) {
  registry.set(String(url), { status, headers, body });
}
export function resetMocks() { registry.clear(); }

export async function fakeFetch(url, opts = {}) {
  const entry = registry.get(String(url));
  if (!entry) {
    return { ok: false, status: 404, text: async () => 'not mocked' };
  }
  return {
    ok: entry.status >= 200 && entry.status < 300,
    status: entry.status,
    headers: entry.headers,
    text: async () => String(entry.body),
    json: async () => {
      try { return JSON.parse(entry.body); } catch { throw new Error('invalid json'); }
    }
  };
}

globalThis.fetch = fakeFetch;

export async function withFakeNow(epochMs, fn) {
  const realNow = Date.now;
  Date.now = () => epochMs;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}

export { sleep, assert };
