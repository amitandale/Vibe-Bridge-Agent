// lib/security/hmac.mjs
// PR-BA-02 Overlay 1: Core HMAC verification logic with rotation grace.
// Pure functions only. No side effects. No repo/db coupling.
// SPDX-License-Identifier: MIT
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Environment configuration
 */
export const DEFAULT_GRACE_S = Number.parseInt(process.env.HMAC_ROTATION_GRACE_S ?? '', 10) || 604800; // 7d

/**
 * Parse x-signature header of form "sha256=<hex>"
 * Returns { alg: 'sha256', hex: '<lowercase hex>' }
 * Throws Error('BAD_SIGNATURE_FORMAT') if invalid.
 */
export function parseSignatureHeader(header) {
  if (typeof header !== 'string') throw withStatus(new Error('BAD_SIGNATURE_FORMAT'), 403);
  const [alg, hex] = header.split('=', 2);
  if (alg !== 'sha256' || !/^[0-9a-fA-F]+$/.test(hex ?? '')) {
    throw withStatus(new Error('BAD_SIGNATURE_FORMAT'), 403);
  }
  return { alg, hex: (hex ?? '').toLowerCase() };
}

/**
 * Compute lowercase hex HMAC-SHA256 of raw body using secret.
 * @param {string|Buffer} secret
 * @param {Uint8Array|Buffer|string|null} rawBody
 * @returns {string} lowercase hex
 */
export function computeHmacHex(secret, rawBody) {
  const b = toBuffer(rawBody);
  const mac = createHmac('sha256', toBuffer(secret));
  mac.update(b);
  return mac.digest('hex');
}

/**
 * Produce header string "sha256=<hex>" for given secret and raw body.
 * @param {string|Buffer} secret
 * @param {Uint8Array|Buffer|string|null} rawBody
 * @returns {string} header
 */
export function sign(secret, rawBody) {
  const hex = computeHmacHex(secret, rawBody);
  return `sha256=${hex}`;
}

/**
 * Constant-time compare of two lowercase-hex strings.
 * Returns boolean.
 */
export function constantTimeEqualHex(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string') return false;
  try {
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    if (a.length !== b.length) {
      // Compare with same-length buffer to keep timing consistent.
      const pad = Buffer.alloc(Math.max(a.length, b.length));
      const aa = Buffer.concat([a, Buffer.alloc(pad.length - a.length)]);
      const bb = Buffer.concat([b, Buffer.alloc(pad.length - b.length)]);
      return timingSafeEqual(aa, bb) && false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Constant-time compare for arbitrary UTF-8 strings.
 * Returns boolean. Different lengths still execute a timingSafeEqual on padded buffers.
 */
export function timingSafeEqualStr(aStr, bStr) {
  if (typeof aStr !== 'string' || typeof bStr !== 'string') return false;
  try {
    const a = Buffer.from(aStr, 'utf8');
    const b = Buffer.from(bStr, 'utf8');
    if (a.length !== b.length) {
      const len = Math.max(a.length, b.length);
      const aa = Buffer.concat([a, Buffer.alloc(len - a.length)]);
      const bb = Buffer.concat([b, Buffer.alloc(len - b.length)]);
      return timingSafeEqual(aa, bb) && false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Utility to attach HTTP status on errors.
 * @param {Error} err
 * @param {number} status
 */
export function withStatus(err, status) {
  // non-enumerable to avoid noisy logs
  Object.defineProperty(err, 'status', { value: status, enumerable: false });
  return err;
}

function toBuffer(x) {
  if (x == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(x)) return x;
  if (x instanceof Uint8Array) return Buffer.from(x);
  if (typeof x === 'string') return Buffer.from(x, 'utf8');
  throw new TypeError('RAW_BODY_MUST_BE_BUFFER_STRING_OR_UINT8ARRAY');
}

/**
 * @typedef {Object} SecretRecord
 * @property {string} kid
 * @property {string} project_id
 * @property {string} value // secret string
 * @property {number} created_at // epoch seconds
 * @property {number|null} rotated_at // epoch seconds or null
 * @property {number} active // 1 = active
 */

/**
 * Build a verifier with injected secrets provider.
 * @param {Object} deps
 * @param {(projectId: string) => Promise<SecretRecord[]>} deps.getActiveSecretsByProject
 * @param {number} [deps.rotationGraceSeconds]
 * @returns {{ verify: (args: {
 *    projectId: string,
 *    kid: string,
 *    signatureHeader: string,
 *    rawBody: Buffer|Uint8Array|string|null,
 *    nowS?: number
 * }) => Promise<void> }}
 */
export function buildVerifier({ getActiveSecretsByProject, rotationGraceSeconds }) {
  if (typeof getActiveSecretsByProject !== 'function') throw new TypeError('getActiveSecretsByProject required');
  const grace = Number.isFinite(rotationGraceSeconds) ? rotationGraceSeconds : DEFAULT_GRACE_S;

  /**
   * Verify signature against current or previous active key within grace window.
   * Throws 401 if no active key for project.
   * Throws 403 on format mismatch or bad signature or outside grace.
   * Returns void on success.
   */
  async function verify({ projectId, kid, signatureHeader, rawBody, nowS }) {
    if (!projectId) throw withStatus(new Error('NO_PROJECT'), 401);
    const { hex } = parseSignatureHeader(signatureHeader);
    const now = Number.isFinite(nowS) ? nowS : Math.floor(Date.now() / 1000);
    const secrets = await getActiveSecretsByProject(projectId);
    const actives = (Array.isArray(secrets) ? secrets : []).filter(s => Number(s?.active) === 1);

    if (actives.length === 0) {
      throw withStatus(new Error('NO_ACTIVE_KEY_FOR_PROJECT'), 401);
    }
    if (actives.length > 2) {
      // Enforce invariant. Treat as server misconfig.
      const e = new Error('TOO_MANY_ACTIVE_KEYS');
      e.invariant = 'at_most_two_active_keys';
      throw withStatus(e, 500);
    }

    // Determine current and previous by created_at, most recent is current.
    const sorted = actives.slice().sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
    const prev = sorted.length === 2 ? sorted[0] : null;
    const curr = sorted[sorted.length - 1];

    // Helper to attempt verification with a secret
    const attempt = (secretValue) => {
      const expectedHex = computeHmacHex(secretValue, rawBody);
      return constantTimeEqualHex(hex, expectedHex);
    };

    // First try current regardless of kid header to keep behavior predictable.
    // Then try previous only if within grace window.
    if (attempt(curr.value)) return;

    if (prev) {
      const rotatedAt = Number(prev.rotated_at ?? 0);
      const withinGrace = rotatedAt > 0 && (now - rotatedAt) <= grace;
      if (withinGrace && attempt(prev.value)) return;

      // If client explicitly used previous kid but grace expired, produce 403
      // to avoid leaking whether key exists.
      if (!withinGrace && kid === prev.kid) {
        throw withStatus(new Error('OUTSIDE_GRACE_WINDOW'), 403);
      }
    }

    // Mismatch
    throw withStatus(new Error('BAD_SIGNATURE'), 403);
  }

  return { verify };
}



/**
 * Build a middleware-like guard that verifies HMAC headers.
 * Signature:
 *   requireHmac({ getActiveSecretsByProject, rotationGraceSeconds, headers? }) -> async (req, res, next) => void
 * - Expects headers: x-vibe-project, x-vibe-kid, x-signature.
 * - Uses req.rawBody if available, otherwise req.body if Buffer/string, otherwise empty.
 */
export function requireHmac({ getActiveSecretsByProject, rotationGraceSeconds, headers } = {}) {
  const projHeader = headers?.project ?? 'x-vibe-project';
  const kidHeader = headers?.kid ?? 'x-vibe-kid';
  const sigHeader = headers?.signature ?? 'x-signature';
  const { verify } = buildVerifier({ getActiveSecretsByProject, rotationGraceSeconds });

  return async function hmacGuard(req, res, next) {
    const hdrs = (req && req.headers) || {};
    const projectId = hdrs[projHeader] || hdrs[projHeader.toLowerCase()] || req?.get?.(projHeader);
    const kid = hdrs[kidHeader] || hdrs[kidHeader.toLowerCase()] || req?.get?.(kidHeader);
    const signatureHeader = hdrs[sigHeader] || hdrs[sigHeader.toLowerCase()] || req?.get?.(sigHeader);

    let rawBody = req?.rawBody;
    if (rawBody == null) {
      const b = req?.body;
      if (Buffer.isBuffer(b) || typeof b === 'string' || b instanceof Uint8Array) rawBody = b;
      else rawBody = null;
    }

    try {
      await verify({ projectId, kid, signatureHeader, rawBody });
      if (typeof next === 'function') return next();
      return true;
    } catch (err) {
      if (res && typeof res.status === 'function' && typeof res.send === 'function') {
        res.status(err?.status || 403).send('forbidden');
        return;
      }
      throw err;
    }
  };
}


/**
 * Testing hook for legacy API parity.
 * Our verifier is stateless, so this is a no-op.
 */
export async function _clearStore() { /* no-op */ }


/**
 * Testing hook for legacy API parity.
 * Stateless verifier does not manage keys, so this is a no-op.
 * Accepts either (_projectId, _kid, _key) or (options object). Returns true.
 */
export async function _rotate() { return true; }
