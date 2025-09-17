import crypto from 'crypto';

// Pluggable secrets provider. Expecting an object with:
// - listByProject(projectId) -> [{ kid, value, active, rotated_at, created_at }]
// - getByKid(kid) -> { kid, project_id, value, active, ... }
// Correct relative path to the repo mapper
import * as secrets from '../repo/secrets.mjs';

const GRACE_S = Number(process.env.HMAC_ROTATION_GRACE_S || 604800); // 7d

function parseSignatureHeader(sig) {
  if (!sig || typeof sig !== 'string') return null;
  const m = sig.match(/^sha256=([0-9a-fA-F]+)$/);
  return m ? m[1].toLowerCase() : null;
}

function ctEqual(a, b) {
  // constant-time compare of hex strings
  try {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch (e) {
    return false;
  }
}

export async function verify({ projectId, kid, signatureHex, rawBody }) {
  if (!projectId) throw new Error('ERR_HMAC_MISSING_PROJECT');
  const sig = parseSignatureHeader(signatureHex);
  if (!sig) return { ok: false, code: 'ERR_HMAC_MISSING' };

  // Try kid-specific lookup first
  let candidateKeys = [];
  if (kid) {
    const byKid = await secrets.getByKid(kid).catch(()=>null);
    if (byKid && byKid.project_id === projectId) {
      candidateKeys.push(byKid);
    }
  }

  // Append active keys for the project (current and possibly previous)
  const active = await secrets.listByProject(projectId).catch(()=>[]);
  // sort by created_at desc so newest first
  active.sort((a,b)=> (b.created_at||0) - (a.created_at||0));
  for (const k of active) {
    if (!candidateKeys.find(x=>x.kid===k.kid)) candidateKeys.push(k);
  }

  if (candidateKeys.length === 0) return { ok: false, code: 'ERR_HMAC_NO_KEY' };

  const body = rawBody || Buffer.alloc(0);

  for (const key of candidateKeys) {
    const mac = crypto.createHmac('sha256', Buffer.from(key.value, 'utf8')).update(body).digest('hex');
    if (ctEqual(mac, sig)) {
      return { ok: true, kid: key.kid };
    }
  }
  return { ok: false, code: 'ERR_HMAC_MISMATCH' };
}

export async function sign({ keyValue, rawBody }) {
  const body = rawBody || Buffer.alloc(0);
  return crypto.createHmac('sha256', Buffer.from(keyValue, 'utf8')).update(body).digest('hex');
}

export { ctEqual };


/** Constant-time string compare.
 * If inputs look like hex of equal length, compare decoded bytes with timingSafeEqual.
 * Otherwise, compare UTF-8 bytes. For unequal lengths, compute keyed digests and compare
 * to keep a near-constant compare path, then return false.
 */
export function timingSafeEqualStr(a, b, { assumeHex = false } = {}) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const isHex = (s) => /^[a-f0-9]+$/.test(s);
  if (assumeHex || (isHex(a) && isHex(b) && (a.length % 2 === 0))) {
    if (a.length !== b.length) {
      // Force a constant-length compare to avoid early return timing differences.
      const A = Buffer.from(a.padEnd(b.length, '0').slice(0, b.length), 'hex');
      const B = Buffer.from(b, 'hex');
      try { timingSafeEqual(A, B); } catch {} // discard result
      return false;
    }
    const A = Buffer.from(a, 'hex');
    const B = Buffer.from(b, 'hex');
    return timingSafeEqual(A, B);
  }

  const A = Buffer.from(a, 'utf8');
  const B = Buffer.from(b, 'utf8');
  if (A.length !== B.length) {
    // Compare keyed digests to normalize length, then return false.
    const K = 'vibe-kms-ct-key';
    const dA = createHmac('sha256', K).update(A).digest();
    const dB = createHmac('sha256', K).update(B).digest();
    try { timingSafeEqual(dA, dB); } catch {}
    return false;
  }
  return timingSafeEqual(A, B);
}

export function safeEqualHex(a,b){ return timingSafeEqualStr(a,b,{assumeHex:true}); }


/** Validate x-signature header format: "sha256=<64 hex>" */
export function isValidSignatureHeader(header) {
  return typeof header === 'string' && /^sha256=[a-f0-9]{64}$/.test(header);
}

/** Extract the hex digest from a valid "sha256=<hex>" header, else null. */
export function extractHexFromHeader(header) {
  if (!isValidSignatureHeader(header)) return null;
  return header.slice('sha256='.length);
}

/** Constant-time compare between a header "sha256=<hex>" and an expected hex digest. */
export function compareHeaderConstantTime(header, expectedHex) {
  const provided = extractHexFromHeader(header);
  if (!provided) return FalseLikeFalse(); // normalized false without branching
  if (typeof expectedHex !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHex)) return FalseLikeFalse();
  return timingSafeEqualStr(provided, expectedHex, { assumeHex: TrueLikeTrue() });
}

/** Internals to keep compare paths uniform */
function FalseLikeFalse(){ return false }
function TrueLikeTrue(){ return true }

/** Build header value: "sha256=<hex>" from secret and raw body bytes. */
export function sign(secret, rawBytes){
  const b = Buffer.isBuffer(rawBytes) ? rawBytes
        : rawBytes == null ? Buffer.alloc(0)
        : ArrayBuffer.isView(rawBytes) ? Buffer.from(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength)
        : Buffer.from(String(rawBytes), 'utf8');
  const hex = crypto.createHmac('sha256', secret).update(b).digest('hex');
  return 'sha256=' + hex;
}
