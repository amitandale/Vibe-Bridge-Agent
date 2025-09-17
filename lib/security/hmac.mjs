// lib/security/hmac.mjs
// PR-BA-02 Overlay 1 — Compatibility layer for work branch tests.
// Exports: parseSignatureHeader, ctEqual, timingSafeEqualStr, sign, verify, verifySignature,
//          lookupKey, _clearStore, _seed, _rotate.
// Uses DB-backed secrets repo (lib/repo/secrets.mjs). No external side effects beyond that.
import crypto from 'node:crypto';
import * as secrets from '../repo/secrets.mjs';

export const DEFAULT_GRACE_S = Number.parseInt(process.env.HMAC_ROTATION_GRACE_S || '604800', 10) || 604800;

export function parseSignatureHeader(sig) {
  if (!sig || typeof sig !== 'string') return null;
  const m = sig.match(/^sha256=([0-9a-fA-F]{64})$/);
  return m ? m[1].toLowerCase() : null;
}

// constant-time compare of hex strings
function _ctEqualHex(a, b) {
  try {
    const ab = Buffer.from(String(a), 'hex');
    const bb = Buffer.from(String(b), 'hex');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}
export { _ctEqualHex as ctEqual };

export function timingSafeEqualStr(a, b) {
  try {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Sign helpers
 * - sign({ keyValue, rawBody }) -> returns lowercase hex (64 chars)
 * - sign(secret, body) OR sign(body, secret) -> returns header "sha256=<hex>"
 */
export function sign(a, b) {
  // object form
  if (a && typeof a === 'object' && !Buffer.isBuffer(a) && !(a instanceof Uint8Array)) {
    const keyValue = a.keyValue ?? a.secret ?? a.key;
    const rawBody = a.rawBody ?? a.body ?? null;
    const data = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody ?? '');
    return crypto.createHmac('sha256', Buffer.from(String(keyValue), 'utf8')).update(data).digest('hex');
  }
  // two-arg form
  const isStrA = typeof a === 'string';
  const isStrB = typeof b === 'string';
  const secret = isStrA && !isStrB ? a : b;
  const body = isStrA && !isStrB ? b : a;
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '');
  const hex = crypto.createHmac('sha256', Buffer.from(String(secret), 'utf8')).update(data).digest('hex');
  return 'sha256=' + hex;
}

/**
 * Verify against repo-backed secrets with kid hint and rotation grace handled by DB.
 * Returns { ok: true, kid } or { ok: false, code }.
 */
export async function verify({ projectId, kid, signatureHex, rawBody }) {
  if (!projectId) throw new Error('ERR_HMAC_MISSING_PROJECT');
  const sig = parseSignatureHeader(signatureHex);
  if (!sig) return { ok: false, code: 'ERR_HMAC_MISSING' };

  // first candidate: by kid if present and matches project
  const candidates = [];
  if (kid) {
    const byKid = await secrets.getByKid(kid).catch(() => null);
    if (byKid && byKid.project_id === projectId && Number(byKid.active) === 1) {
      candidates.push(byKid);
    }
  }

  // then append actives for project (newest first)
  const active = await secrets.listByProject(projectId).catch(() => []);
  active.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  for (const k of active) {
    if (Number(k.active) === 1 && !candidates.find(x => x.kid === k.kid)) candidates.push(k);
  }

  if (candidates.length === 0) return { ok: false, code: 'ERR_HMAC_NO_KEY' };

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody ?? '');
  for (const key of candidates) {
    const mac = crypto.createHmac('sha256', Buffer.from(key.value, 'utf8')).update(body).digest('hex');
    if (_ctEqualHex(mac, sig)) {
      return { ok: true, kid: key.kid };
    }
  }
  return { ok: false, code: 'ERR_HMAC_MISMATCH' };
}

/**
 * Verify convenience that accepts either header or hex in `signature`, and Buffer/string in `raw`.
 * Returns { ok, code?, used?: 'current'|'previous' }.
 */
export async function verifySignature({ projectId, kid, signature, raw }, { now = Date.now(), grace_s = DEFAULT_GRACE_S } = {}) {
  const signatureHex = signature && signature.startsWith('sha256=') ? signature : ('sha256=' + String(signature ?? ''));
  const r = await verify({ projectId, kid, signatureHex, rawBody: raw });
  if (!r.ok) return r;
  // Determine used=current|previous from repo metadata
  try {
    const recs = await secrets.listByProject(projectId);
    const match = recs.find(x => x.kid === r.kid);
    if (match) {
      const rotated_at = Number(match.rotated_at || 0);
      if (rotated_at > 0) {
        const age = Math.floor(now / 1000) - rotated_at;
        if (age <= grace_s) return { ok: true, used: 'previous' };
      }
    }
  } catch {}
  return { ok: true, used: 'current' };
}

/**
 * Lookup an active key by project and kid, respecting grace window.
 * Returns { key, kid, source } or null.
 */
export async function lookupKey(projectId, kid, { now = Date.now(), grace_s = DEFAULT_GRACE_S } = {}) {
  if (!projectId || !kid) return null;
  const recs = await secrets.listByProject(projectId).catch(() => []);
  // Newest first
  recs.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const cur = recs.find(r => Number(r.active) === 1);
  if (cur && cur.kid === kid) return { key: cur.value, kid, source: 'current' };
  // previous has active=1 but rotated_at set, within grace
  const prev = recs.find(r => Number(r.active) === 1 && r.kid !== (cur && cur.kid) && r.rotated_at);
  if (prev) {
    const age = Math.floor(now / 1000) - Number(prev.rotated_at || Math.floor(now / 1000));
    if (age <= grace_s && prev.kid === kid) return { key: prev.value, kid, source: 'previous' };
  }
  return null;
}

// Testing/utility hooks using repo-backed store
export async function _clearStore() { await secrets.clear(); }

export async function _seed({ projectId, kid, key, now = Date.now() }) {
  if (!projectId || !kid || !key) throw new Error('bad seed');
  await secrets.upsert({ kid, project_id: projectId, type: 'HMAC', value: key, active: 1, created_at: now });
  return true;
}

export async function _rotate({ projectId, newKid, newKey, now = Date.now() }) {
  if (!projectId || !newKid || !newKey) throw new Error('bad rotate');
  const actives = await secrets.listByProject(projectId).catch(() => []);
  const cur = actives.find(r => Number(r.active) === 1);
  if (cur) await secrets.deactivate(cur.kid, now);
  await secrets.upsert({ kid: newKid, project_id: projectId, type: 'HMAC', value: newKey, active: 1, created_at: now });
  return true;
}
