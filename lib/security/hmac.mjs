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
